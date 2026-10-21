"""Start an embedding task for a video (local replacement for start-nova-mme / start-tlabs-mme).

Creates the task record (Type 'embedding') and hands the heavy work to eval-srv-wf-embed-video, which
runs asynchronously, like the Bedrock async job + S3 listener it replaces.

Which settings a task accepts is declared per model in models.yaml (`parameters`); they are validated here,
stored on the task's Request, and passed to the worker.
"""
import json
import os
import re
import uuid
from datetime import datetime, timezone

import boto3

import task_records
from providers import get_registry

DYNAMO_VIDEO_TABLE = os.environ.get("DYNAMO_VIDEO_TABLE")
WORKER_LAMBDA = os.environ.get("EMBED_WORKER_LAMBDA", "eval-srv-wf-embed-video")

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
}

dynamodb = boto3.resource("dynamodb")
lambda_client = boto3.client("lambda")


def _response(status, body):
    return {"statusCode": status, "headers": CORS_HEADERS, "body": json.dumps(body)}


def default_embedding_model():
    return next((m.id for m in get_registry().models.values() if m.task == "embedding"), None)


def _present(value):
    return value is not None and value != ""


def resolve_parameters(spec, requested):
    """Validate the request against the model's declared parameters; anything missing or invalid gets its default."""
    out = {}
    for param in spec.extra.get("parameters", []):
        key, default, kind = param["key"], param.get("default"), param.get("type", "number")
        raw = requested.get(key)
        if kind == "boolean":
            value = raw.strip().lower() in ("1", "true", "yes", "on") if isinstance(raw, str) else (bool(raw) if raw is not None else bool(default))
        elif kind == "multiselect":
            valid = [o["value"] for o in param.get("options", []) if not o.get("disabled")]  # disabled = not available yet
            wanted = raw if isinstance(raw, list) else ([raw] if _present(raw) else [])
            value = [v for v in valid if v in wanted] or list(default or valid[:1])  # keep declared order, drop unknowns
        elif kind == "select":
            options = param.get("options", [])
            try:
                value = type(default)(raw) if _present(raw) else default
            except (TypeError, ValueError):
                value = default
            if value not in options:
                value = default
        else:  # number
            try:
                value = int(float(raw)) if _present(raw) else default
            except (TypeError, ValueError):
                value = default
            if value is not None:
                value = max(param.get("min", value), min(param.get("max", value), value))
        out[key] = value
    return out


def default_task_name(spec, params):
    """e.g. omni-embed-nemotron-3b-5s-video+audio-separate-1024d (same pattern as the UI's default name)."""
    short = re.sub(r"\s*\(.*\)\s*$", "", spec.name or spec.id.split("/")[-1]).replace(" ", "-").lower()
    inputs = params.get("Inputs") or ["video"]
    parts = [short, f"{params.get('DurationS')}s", "+".join(inputs)]
    if len(inputs) > 1 and params.get("Combine") is False:
        parts.append("separate")
    dim = params.get("EmbeddingDim")
    if dim and spec.extra.get("dims") and dim != spec.extra["dims"]:
        parts.append(f"{dim}d")
    return "-".join(parts)


def lambda_handler(event, context):
    try:
        body = event.get("body", event) if isinstance(event, dict) else event
        if isinstance(body, str):
            body = json.loads(body)

        video_id = body.get("VideoId") or body.get("video_id")
        if not video_id:
            return _response(400, {"error": "Missing required field: VideoId or video_id"})
        video = dynamodb.Table(DYNAMO_VIDEO_TABLE).get_item(Key={"Id": video_id}).get("Item")
        if not video:
            return _response(404, {"error": f"Video not found: {video_id}"})
        if not video.get("S3Bucket") or not video.get("S3KeyVideo"):
            return _response(400, {"error": "Video S3 location not found"})

        model_id = body.get("ModelId") or body.get("model_id") or default_embedding_model()
        if not model_id:
            return _response(400, {"error": "No embedding model is configured (see local/models.yaml)"})
        spec, _provider = get_registry().resolve(model_id)

        request_params = dict(body.get("Request", {}) or {})
        if "duration_s" in body:  # snake_case alias used by the original API
            request_params.setdefault("DurationS", body["duration_s"])
        params = resolve_parameters(spec, request_params)

        task_id = str(uuid.uuid4())
        item = {
            "Id": task_id,
            "Type": "embedding",
            "VideoId": video_id,
            "Name": (body.get("Name") or "").strip() or default_task_name(spec, params),
            "Description": body.get("Description") or body.get("description") or "",
            "ModelId": model_id,
            "StartedTs": datetime.now(timezone.utc).isoformat(),
            "Status": "processing",
            "Request": {
                "EmbeddingDim": spec.extra.get("dims") or 0,  # the model's native size, unless the user chose a smaller one
                **params,
                "Provider": spec.provider,
                "RequestedBy": request_params.get("RequestedBy") or body.get("requested_by") or "unknown",
            },
            "Result": {
                "S3BucketResult": video["S3Bucket"],
                "S3OutputPrefix": f"tasks/{video_id}/video-analyze/embedding/{task_id}/",
                "S3VectorBucket": "local",
                "S3VectorIndex": f"emb-{task_id}",
                "EmbeddingCount": 0,
            },
        }
        task_records.table().put_item(Item=task_records.to_decimal(item))

        lambda_client.invoke(
            FunctionName=WORKER_LAMBDA,
            InvocationType="Event",
            Payload=json.dumps({"TaskId": task_id, "VideoId": video_id, "ModelId": model_id, "Params": params}),
        )
        return _response(200, {
            "task_id": task_id,
            "video_id": video_id,
            "status": "processing",
            "message": "Embedding task started successfully",
        })
    except Exception as exc:
        import traceback

        print(f"Error: {exc}\n{traceback.format_exc()}")
        return _response(500, {"error": str(exc)})
