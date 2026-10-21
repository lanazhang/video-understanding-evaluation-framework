"""Video understanding through any OpenAI-compatible endpoint (NVIDIA NIM by default).

Same contract as eval-srv-api-bedrock-converse: invoked by start-video-understanding with a
TaskId, writes the outcome onto the analyze-table record, and returns an API-Gateway-style response.
Instead of handing the model an S3 URI, frames are sampled locally and sent with their timestamps
(or the whole clip as a base64 data URL when the model is configured with video_input: video_url).
"""
import base64
import json
import os
import re
import tempfile
import traceback
from datetime import datetime, timezone
from decimal import Decimal

import boto3

from providers import get_registry
from providers import video_frames

DYNAMO_VIDEO_TABLE = os.environ.get("DYNAMO_VIDEO_TABLE")
DYNAMO_VIDEO_ANALYZE_TABLE = os.environ.get("DYNAMO_VIDEO_ANALYZE_TABLE")
MAX_VIDEO_B64_MB = float(os.environ.get("MAX_VIDEO_B64_MB", "20"))

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
}

s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")

DEFAULT_SCHEMA_HINT = """{
  "scenes": [
    {
      "start_time": "MM:SS or HH:MM:SS",
      "end_time": "MM:SS or HH:MM:SS",
      "description": "Description of what happens in this scene"
    }
  ]
}"""


def _response(status, body):
    return {"statusCode": status, "headers": CORS_HEADERS, "body": json.dumps(body)}


def to_decimal(obj):
    if isinstance(obj, list):
        return [to_decimal(i) for i in obj]
    if isinstance(obj, dict):
        return {k: to_decimal(v) for k, v in obj.items()}
    if isinstance(obj, float):
        return Decimal(str(obj))
    return obj


def build_prompt(input_prompt, tool_config):
    """Plain-text JSON instructions (NIM models don't share Bedrock's tool-use schema contract).

    If the UI sent a Bedrock-style toolConfig, its inputSchema is reused so the output shape matches.
    """
    schema_text, description = DEFAULT_SCHEMA_HINT, ""
    try:
        spec = (tool_config or {}).get("tools", [])[0].get("toolSpec", {})
        schema = spec.get("inputSchema", {}).get("json")
        if schema:
            schema_text, description = json.dumps(schema, indent=2), spec.get("description", "")
    except (AttributeError, IndexError, TypeError):
        pass
    return (
        f"{input_prompt}\n\n{description}\n\n"
        "Respond in JSON that follows this schema. Follow these guidelines:\n"
        "- Ensure that every field is populated.\n"
        "- Give timestamps in the format the schema asks for, using the frame timestamps provided.\n"
        "- Describe in detail what happens in each moment/scene.\n"
        "- Do not invent events that are not in the video.\n\n"
        f"JSON Schema:\n{schema_text}\n\nReturn only the JSON object, no additional text."
    ).replace("\n\n\n", "\n\n")


def extract_json(text):
    """Models often wrap JSON in prose or ```fences```. Returns compact JSON text, or the original text."""
    candidate = text.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", candidate, re.S | re.I)
    if fenced:
        candidate = fenced.group(1).strip()
    for attempt in (candidate, candidate[candidate.find("{"): candidate.rfind("}") + 1] if "{" in candidate else ""):
        if not attempt:
            continue
        try:
            return json.dumps(json.loads(attempt))
        except ValueError:
            continue
    return text


def build_messages(spec, prompt, local_path, duration):
    content = [{"type": "text", "text": prompt}]
    if spec.video_input == "video_url":
        size_mb = os.path.getsize(local_path) / 1e6
        if size_mb <= MAX_VIDEO_B64_MB:
            with open(local_path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode()
            content.append({"type": "video_url", "video_url": {"url": f"data:video/mp4;base64,{b64}"}})
            return [{"role": "user", "content": content}], {"mode": "video_url", "sizeMb": round(size_mb, 1)}
        print(f"Video is {size_mb:.0f} MB (> {MAX_VIDEO_B64_MB} MB); falling back to sampled frames")

    frames, interval = video_frames.sample_frames(local_path, duration, spec.max_frames, spec.frame_max_side)
    total = video_frames.format_ts(duration) if duration else "unknown"
    content[0]["text"] += (
        f"\n\nThe video is {total} long. It is given as {len(frames)} frames sampled about every "
        f"{interval:.1f}s; each frame is preceded by its timestamp."
    )
    for ts, jpeg in frames:
        content.append({"type": "text", "text": f"[{video_frames.format_ts(ts)}]"})
        content.append({"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(jpeg).decode()}})
    return [{"role": "user", "content": content}], {"mode": "frames", "frames": len(frames), "intervalS": round(interval, 2)}


def _update_task(task_id, **changes):
    table = dynamodb.Table(DYNAMO_VIDEO_ANALYZE_TABLE)
    item = table.get_item(Key={"Id": task_id, "Type": "video-understanding"}).get("Item")
    if not item:
        return
    now = datetime.now(timezone.utc).isoformat()
    item["CompletedTs"] = now
    result = item.setdefault("Result", {})
    result.update(changes.pop("result", {}))
    item.update(changes)
    if item.get("StartedTs"):
        started = datetime.fromisoformat(item["StartedTs"].replace("Z", "+00:00"))
        result["ProcessingTimeS"] = (datetime.fromisoformat(now) - started).total_seconds()
    table.put_item(Item=to_decimal(item))


def lambda_handler(event, context):
    task_id = None
    try:
        body = event.get("body", event) if isinstance(event, dict) else event
        if isinstance(body, str):
            body = json.loads(body)

        video_id = body.get("VideoId") or body.get("video_id")
        input_prompt = body.get("InputPrompt") or body.get("input_prompt")
        model_id = body.get("ModelId") or body.get("model_id")
        task_id = body.get("TaskId") or body.get("task_id")
        if not video_id:
            return _response(400, {"error": "Missing required field: VideoId or video_id"})
        if not input_prompt:
            return _response(400, {"error": "Missing required field: InputPrompt or input_prompt"})
        if not model_id:
            return _response(400, {"error": "Missing required field: ModelId"})

        video = dynamodb.Table(DYNAMO_VIDEO_TABLE).get_item(Key={"Id": video_id}).get("Item")
        if not video:
            return _response(404, {"error": f"Video not found: {video_id}"})
        s3_bucket, s3_key = video.get("S3Bucket"), video.get("S3KeyVideo")
        if not s3_bucket or not s3_key:
            return _response(400, {"error": "Video S3 location not found"})

        spec, provider = get_registry().resolve(model_id)
        max_tokens = body.get("MaxTokens") or body.get("max_tokens") or spec.max_tokens
        prompt = build_prompt(input_prompt, body.get("ToolConfig") or body.get("tool_config"))
        duration = float(video["Duration"]) if video.get("Duration") else None

        with tempfile.TemporaryDirectory(prefix="vu_") as tmp:
            local_path = os.path.join(tmp, os.path.basename(s3_key))
            s3.download_file(s3_bucket, s3_key, local_path)
            messages, input_info = build_messages(spec, prompt, local_path, duration)

        print(f"Calling {provider.name} ({provider.base_url}) model={model_id} input={input_info}")
        result = provider.chat(
            model_id, messages,
            temperature=body.get("Temperature") or body.get("temperature"),
            max_tokens=max_tokens,
            top_p=body.get("TopP") or body.get("top_p"),
        )
        result["content"] = extract_json(result["content"])

        if task_id:
            _update_task(
                task_id,
                Status="completed",
                result={
                    "Response": result["content"],
                    "ResponseMetadata": {
                        "inputTokens": result["usage"]["inputTokens"],
                        "outputTokens": result["usage"]["outputTokens"],
                        "stopReason": result["stopReason"],
                        "input": input_info,
                    },
                },
            )
        return _response(200, {
            "video_id": video_id,
            "status": "completed",
            "response": result,
            "message": "OpenAI-compatible video analysis completed successfully",
        })

    except Exception as exc:
        print(f"Error: {exc}\n{traceback.format_exc()}")
        if task_id:
            try:
                _update_task(task_id, Status="failed", result={"ErrorMessage": str(exc)})
            except Exception as db_exc:
                print(f"Error recording failure: {db_exc}")
        return _response(500, {"error": str(exc)})
