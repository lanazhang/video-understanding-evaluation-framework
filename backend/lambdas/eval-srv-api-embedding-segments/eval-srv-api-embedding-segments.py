"""List the segments an embedding task indexed, so the UI can draw how the video was cut.

Read from the stored vectors (the source of truth for what search can find), so it works for every task, old or new. For a task
made by shot, the task's Result.SegmentMap says which shot each segment came from; that is attached as `ShotIndex` (segments
that are pieces of one long shot share it). Tasks without a map (fixed length, or made before the map existed) get no ShotIndex.
"""
import json

import task_records
from store import vectors

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
}

# Vectors are tagged with the inputs they were made from; the UI uses the same names as the search filter
OPTION_LABELS = {"video+audio": "audio-video"}
EPS = 0.002  # seconds; segment edges are stored rounded to 3 decimals


def _response(status, body):
    return {"statusCode": status, "headers": CORS_HEADERS, "body": json.dumps(body)}


def _shot_lookup(segment_map):
    """start -> shot index, from Result.SegmentMap = [[start, end, shot], ...] (numbers may arrive as Decimal)."""
    out = []
    for entry in segment_map or []:
        try:
            out.append((float(entry[0]), float(entry[1]), int(entry[2])))
        except (TypeError, ValueError, IndexError):
            continue
    return out


def _shot_for(lookup, start, end):
    for s, e, shot in lookup:
        if abs(s - start) < EPS and abs(e - end) < EPS:
            return shot
    return None


def lambda_handler(event, context):
    try:
        body = event.get("body", event) if isinstance(event, dict) else event
        if isinstance(body, str):
            body = json.loads(body)
        task_id = (body or {}).get("TaskId")
        if not task_id:
            return _response(400, {"error": "TaskId is required"})

        task = task_records.get_task(task_id, "embedding")
        if not task:
            return _response(404, {"error": f"Task not found: {task_id}"})
        result = task.get("Result") or {}
        index_name = result.get("S3VectorIndex") or f"emb-{task_id}"

        # one segment can carry several vectors (video, audio, ... made separately): group them by their time range
        grouped = {}
        for start, end, option in vectors.list_segments(index_name):
            grouped.setdefault((round(float(start), 3), round(float(end), 3)), []).append(OPTION_LABELS.get(option, option))
        lookup = _shot_lookup(result.get("SegmentMap"))

        segments = []
        for i, ((start, end), options) in enumerate(sorted(grouped.items())):
            segments.append({
                "Index": i, "StartSec": start, "EndSec": end, "Options": sorted(set(options)),
                "ShotIndex": _shot_for(lookup, start, end) if lookup else None,
            })
        request = task.get("Request") or {}
        return _response(200, {
            "TaskId": task_id,
            "VideoId": task.get("VideoId"),
            "SegmentMode": result.get("SegmentMode") or request.get("SegmentMode") or "fixed",
            "ShotCount": int(result["ShotCount"]) if result.get("ShotCount") is not None else None,   # a Decimal from the database
            "Count": len(segments),
            "Segments": segments,
        })
    except Exception as exc:  # noqa: BLE001
        import traceback

        print(f"Error: {exc}\n{traceback.format_exc()}")
        return _response(500, {"error": str(exc)})
