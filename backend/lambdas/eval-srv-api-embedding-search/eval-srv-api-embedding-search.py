"""Search an embedding task's vectors with text or an image (replaces nova/tlabs-mme-search-vector)."""
import base64
import json
import os

import boto3

import task_records
from providers import get_registry
from store import vectors

DYNAMO_VIDEO_TABLE = os.environ.get("DYNAMO_VIDEO_TABLE")
S3_PRESIGNED_URL_EXPIRY_S = int(os.environ.get("S3_PRESIGNED_URL_EXPIRY_S", 3600))

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
}

s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")


def _response(status, body):
    return {"statusCode": status, "headers": CORS_HEADERS, "body": json.dumps(body)}


# Vectors are tagged with the inputs they were made from ("video", "audio", "image", "video+audio", ...). The UI's
# embedding-type filter uses the original names, so translate in both directions.
OPTION_ALIASES = {
    "video": "video", "visual": "video", "audio": "audio", "image": "image",
    "audio-video": "video+audio", "audio_visual": "video+audio",
}
OPTION_LABELS = {"video+audio": "audio-video"}


def requested_options(body):
    wanted = body.get("EmbeddingOptions")
    if not wanted:
        return None  # everything
    return sorted({OPTION_ALIASES[o] for o in wanted if o in OPTION_ALIASES}) or None


def embed_query(provider, model_id, input_type, text, input_bytes, input_format, dimensions=None):
    if input_type == "image" and input_bytes:
        raw = input_bytes if isinstance(input_bytes, str) else base64.b64encode(input_bytes).decode()
        fmt = (input_format or "jpeg").lower().replace("jpg", "jpeg")
        return provider.embed_image(model_id, raw, fmt, dimensions=dimensions)
    return provider.embed_text(model_id, text, role="query", dimensions=dimensions)


def lambda_handler(event, context):
    try:
        body = event.get("body", event) if isinstance(event, dict) else event
        if isinstance(body, str):
            body = json.loads(body)

        task_id = body.get("TaskId")
        text = (body.get("SearchText") or "").strip()
        input_bytes = body.get("InputBytes") or ""
        top_k = int(body.get("TopK", 5))
        page_size = int(body.get("PageSize", 10))
        from_index = max(int(body.get("FromIndex", 0)), 0)
        include_url = body.get("IncludeVideoUrl", True)

        if not task_id:
            return _response(400, {"error": "TaskId is required"})
        if not text and not input_bytes:
            return _response(400, {"error": "SearchText or InputBytes is required"})

        task = task_records.get_task(task_id, "embedding")
        if not task:
            return _response(404, {"error": f"Task not found: {task_id}"})
        index_name = (task.get("Result") or {}).get("S3VectorIndex") or f"emb-{task_id}"

        spec, provider = get_registry().resolve(task["ModelId"])
        request = task.get("Request") or {}
        # The query must have the same size as the task's vectors, so ask the server for that size too (the native
        # size is not sent: some servers reject any `dimensions` value)
        task_dim = int(request.get("EmbeddingDim") or 0)
        dimensions = task_dim if task_dim and task_dim != int(spec.extra.get("dims") or 0) else None
        query_vec = embed_query(provider, task["ModelId"], body.get("InputType"), text, input_bytes, body.get("InputFormat"), dimensions)
        options = requested_options(body)

        legacy_pooled = "Inputs" not in request and "Modalities" not in request and request.get("IncludeAudio")
        if legacy_pooled:
            # Made before modalities existed: audio+video were pooled into one vector, stored as 'visual'
            options = ["video"] if options is None or "video+audio" in options else []
        hits = vectors.query(index_name, query_vec, top_k, options=options) if options != [] else []

        video_id = task.get("VideoId")
        video = dynamodb.Table(DYNAMO_VIDEO_TABLE).get_item(Key={"Id": video_id}).get("Item") or {}
        s3_bucket, s3_key = video.get("S3Bucket"), video.get("S3KeyVideo")
        video_url = None
        if include_url and s3_bucket and s3_key:
            video_url = s3.generate_presigned_url("get_object", Params={"Bucket": s3_bucket, "Key": s3_key}, ExpiresIn=S3_PRESIGNED_URL_EXPIRY_S)

        results = []
        for hit in hits:
            md = hit["metadata"]
            item = {
                "TaskId": task_id,
                "VideoId": video_id,
                "StartSec": md["startSec"],
                "EndSec": md["endSec"],
                "EmbeddingOption": "audio-video" if legacy_pooled else OPTION_LABELS.get(md.get("option"), md.get("option") or "video"),
                "Distance": hit["distance"],
                "Status": task.get("Status"),
                "S3Bucket": s3_bucket,
                "S3Key": s3_key,
            }
            if video_url:
                item["VideoUrl"] = video_url
            results.append(item)
        return _response(200, results[from_index: from_index + page_size])
    except Exception as exc:
        import traceback

        print(f"Error: {exc}\n{traceback.format_exc()}")
        return _response(500, {"error": str(exc)})
