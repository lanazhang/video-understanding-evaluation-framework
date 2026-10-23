"""Embedding worker: cut the video into segments, embed each with the configured model, store the vectors.

Each segment is embedded from the inputs the user ticked (video, audio, image keyframe). With "combine" on, the
ticked inputs go into ONE request and the model pools them into one vector; with it off, every ticked input gets
its own vector. Vectors are tagged with the inputs they came from ("video", "audio+..."), which search can filter on.

Replaces Bedrock's async segmented-embedding job + the S3 listener that loaded the results into S3 Vectors.
"""
import json
import math
import os
import tempfile
import time
import traceback
from concurrent.futures import ThreadPoolExecutor

import boto3

import task_records
from providers import get_registry, video_frames
from providers.errors import ConnectionFailed, RequestRejected
from store import vectors

DYNAMO_VIDEO_TABLE = os.environ.get("DYNAMO_VIDEO_TABLE")
TASK_TYPE = "embedding"
# A dropped tunnel / briefly unreachable endpoint is retried for roughly 5+10+20 s before the task fails
CONNECT_RETRY_DELAYS_S = (5, 10, 20)
INPUT_ORDER = ("video", "audio", "image")  # canonical order, also used in the vector tag


class EndpointUnreachable(RuntimeError):
    pass


s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")


def plan_segments(duration, seg_s):
    """[(index, start, end)] covering the video; a tail shorter than 1 s is merged into the previous segment."""
    segments, start, i = [], 0.0, 0
    while start < duration - 0.05:
        end = min(start + seg_s, duration)
        if duration - end < 1.0:
            end = duration
        segments.append((i, start, end))
        start, i = end, i + 1
    return segments


def plan_shot_segments(duration, cuts, max_s, min_s=1.0):
    """[(index, start, end)] that follow the shots of the video; see plan_shot_segments_with_shots."""
    return [(i, a, b) for i, a, b, _ in plan_shot_segments_with_shots(duration, cuts, max_s, min_s)]


def plan_shot_segments_with_shots(duration, cuts, max_s, min_s=1.0):
    """[(index, start, end, shot)] that follow the shots of the video, then are made a usable size. `shot` numbers the shots
    (after short ones were joined) from 0, so segments that are pieces of one long shot share a number:

    - the video is cut at `cuts` (times where the picture changes);
    - a shot shorter than `min_s` is joined with the shot after it (a short last shot joins the one before);
    - a shot longer than `max_s` is divided EVENLY into the fewest pieces that are each at most `max_s`
      (a 13 s shot with max 5 s becomes 3 pieces of 4.33 s, not 5 + 5 + 3).
    The segments cover the whole video without gaps or overlaps."""
    min_s = max(float(min_s), 0.01)   # whatever the setting, nothing under 10 ms becomes a segment of its own
    edges = [0.0] + sorted({float(c) for c in cuts if 0.0 < float(c) < duration}) + [float(duration)]
    shots = [(a, b) for a, b in zip(edges, edges[1:]) if b - a > 1e-6]

    merged = []
    for a, b in shots:
        if merged and merged[-1][1] - merged[-1][0] < min_s:
            merged[-1] = (merged[-1][0], b)       # the shot before was too short: extend it over this one
        else:
            merged.append((a, b))
    if len(merged) > 1 and merged[-1][1] - merged[-1][0] < min_s:
        a, b = merged.pop()                        # a too-short last shot joins the one before it
        merged[-1] = (merged[-1][0], b)

    out = []
    for shot, (a, b) in enumerate(merged):
        pieces = max(1, math.ceil((b - a) / max_s - 1e-9))
        step = (b - a) / pieces
        out += [(a + i * step, a + (i + 1) * step if i < pieces - 1 else b, shot) for i in range(pieces)]
    return [(i, round(a, 3), round(b, 3), shot) for i, (a, b, shot) in enumerate(out)]


def segment_fps(base_fps, duration, min_frames=0):
    """Frame rate to cut a segment at. A model can need a minimum number of frames per clip (Cosmos-Embed1 samples 8 and
    fails on fewer), so a short segment, such as the tail of a video, is cut at a higher rate than the configured one."""
    if not min_frames or duration <= 0:
        return base_fps
    return max(base_fps, math.ceil((min_frames + 1) / duration))


def plan_jobs(segments, inputs, combine):
    """[(index, start, end, group)] where group is the tuple of inputs sent together for that vector."""
    groups = [tuple(inputs)] if (combine or len(inputs) == 1) else [(i,) for i in inputs]
    return [(idx, start, end, group) for idx, start, end in segments for group in groups]


def embed_one(provider, model_id, path, side, fps, group, idx, start, end, dimensions=None, min_frames=0):
    """One vector for one segment from `group`. Returns None when the segment has no audio to embed."""
    label = "+".join(group)
    last_error = None
    for attempt_side in (side, max(224, side // 2)):  # a segment the server rejects (e.g. too many tokens) is retried smaller
        media = {}
        if "video" in group:
            media["video"] = video_frames.cut_segment(path, start, end - start, max_side=attempt_side, fps=segment_fps(fps, end - start, min_frames))
        if "audio" in group:
            media["audio"] = video_frames.cut_audio(path, start, end - start)
            if media["audio"] is None:
                return None
        if "image" in group:
            media["image"] = video_frames.cut_frame(path, (start + end) / 2, max_side=max(attempt_side, 480))
        for delay in (*CONNECT_RETRY_DELAYS_S, None):
            try:
                return provider.embed_inputs(model_id, dimensions=dimensions, **media)
            except ConnectionFailed as exc:  # endpoint/tunnel down, not a size problem
                if delay is None:
                    raise EndpointUnreachable(
                        f"Cannot reach the embedding endpoint {provider.base_url} ({exc}). "
                        "If it runs on Brev, check that `brev port-forward` is still running, then re-create the task."
                    ) from exc
                print(f"segment {idx} ({label}): endpoint unreachable, retrying in {delay}s")
                time.sleep(delay)
            except RequestRejected as exc:
                last_error = exc
                print(f"segment {idx} ({start:.1f}-{end:.1f}s, {label}) rejected at max_side={attempt_side}: {exc}")
                break
        if "video" not in group and "image" not in group:  # nothing to make smaller
            break
    raise last_error


def lambda_handler(event, context):
    task_id = event.get("TaskId")
    try:
        video_id, model_id = event["VideoId"], event["ModelId"]
        params = event.get("Params") or {}
        seg_s = int(params.get("DurationS") or event.get("DurationS") or 5)
        # "fixed": every segment is DurationS long. "shots": segments follow the shots of the video; DurationS is then the
        # longest a segment may be (a longer shot is divided evenly) and MinShotS the shortest (a shorter one is joined).
        segment_mode = "shots" if str(params.get("SegmentMode") or "fixed") == "shots" else "fixed"
        shot_threshold = float(params["ShotThreshold"]) if params.get("ShotThreshold") not in (None, "") else 0.3
        min_shot_s = float(params["MinShotS"]) if params.get("MinShotS") not in (None, "") else 1.0
        spec, provider = get_registry().resolve(model_id)
        side = int(params.get("SegmentMaxSide") or spec.extra.get("segment_max_side") or 480)
        fps = int(params.get("SegmentFps") or spec.extra.get("segment_fps") or 2)
        min_frames = int(spec.extra.get("min_frames") or 0)
        requested = [i for i in INPUT_ORDER if i in (params.get("Inputs") or ["video"])]
        combine = bool(params.get("Combine", True))
        # A size other than the model's native one is requested FROM THE SERVER (never cut by this app). The native size
        # is not sent at all: some servers (vLLM without Matryoshka enabled) reject any `dimensions` value.
        wanted_dim = int(params.get("EmbeddingDim") or 0)
        dimensions = wanted_dim if wanted_dim and wanted_dim != int(spec.extra.get("dims") or 0) else None
        index_name = f"emb-{task_id}"

        video = dynamodb.Table(DYNAMO_VIDEO_TABLE).get_item(Key={"Id": video_id}).get("Item")
        if not video:
            raise ValueError(f"Video not found: {video_id}")

        with tempfile.TemporaryDirectory(prefix="embed_") as tmp:
            path = os.path.join(tmp, "video" + os.path.splitext(video["S3KeyVideo"])[1])
            s3.download_file(video["S3Bucket"], video["S3KeyVideo"], path)
            duration = float(video["Duration"]) if video.get("Duration") else video_frames.probe_duration(path)
            if not duration:
                raise ValueError("could not determine the video duration")

            # Audio needs an audio track; skip it (and say so on the task) when there is none
            has_audio = video_frames.has_audio(path)
            inputs = [i for i in requested if has_audio or i != "audio"]
            skipped = [i for i in requested if i not in inputs]
            if not inputs:
                raise ValueError("The video has no audio track, so the selected inputs cannot be embedded.")
            if skipped:
                print(f"Video has no audio stream; skipping {skipped}")

            shot_count, segment_map = None, None
            if segment_mode == "shots":
                task_records.update_task(task_id, TASK_TYPE, result={"Stage": "detecting shots"})
                cuts = video_frames.detect_shots(path, shot_threshold)
                shot_count = len(cuts) + 1
                with_shots = plan_shot_segments_with_shots(duration, cuts, seg_s, min_shot_s)
                segments = [(i, a, b) for i, a, b, _ in with_shots]
                segment_map = [[a, b, shot] for _, a, b, shot in with_shots]   # lets the UI draw which segments share a shot
                print(f"Shots: {shot_count} found at threshold {shot_threshold} -> {len(segments)} segments (max {seg_s}s, min shot {min_shot_s}s)")
            else:
                segments = plan_segments(duration, seg_s)
            lengths = [e - st for _, st, e in segments]
            jobs = plan_jobs(segments, inputs, combine)
            print(f"Embedding {len(segments)} segments ({segment_mode}, {min(lengths):.2f}-{max(lengths):.2f}s): inputs={inputs} combine={combine} -> {len(jobs)} vectors with {model_id}")
            vectors.delete_index(index_name)  # re-runs start clean
            done, tokens, dim = 0, 0, 0
            workers = int(spec.extra.get("concurrency") or 2)
            pool = ThreadPoolExecutor(max_workers=workers)
            try:
                futures = [(job, pool.submit(embed_one, provider, model_id, path, side, fps, job[3], job[0], job[1], job[2], dimensions, min_frames)) for job in jobs]
                batch = []
                for (idx, start, end, group), fut in futures:  # in order, so progress is monotonic
                    out = fut.result()
                    if out is not None:  # None = this stretch has no audio
                        dim = len(out["embedding"])
                        tokens += out["promptTokens"]
                        batch.append({
                            "key": f"{task_id}_{'+'.join(group)}_{idx}", "task_id": task_id, "video_id": video_id,
                            "option": "+".join(group), "start_sec": start, "end_sec": end, "vector": out["embedding"],
                        })
                        done += 1
                    if len(batch) >= 5 or (fut is futures[-1][1] and batch):
                        vectors.put(index_name, batch)
                        batch = []
                        task_records.update_task(task_id, TASK_TYPE, result={"EmbeddingCount": done})
            finally:
                pool.shutdown(wait=False, cancel_futures=True)  # on failure, stop queued segments immediately

        task = task_records.get_task(task_id, TASK_TYPE) or {}
        if task:
            task.setdefault("Request", {})["EmbeddingDim"] = dim
            task_records.table().put_item(Item=task_records.to_decimal(task))
        task_records.update_task(
            task_id, TASK_TYPE, status="completed", finished=True,
            result={
                "EmbeddingCount": done, "SegmentCount": len(segments), "VideoId": video_id, "InputTokens": tokens,
                "InputsEmbedded": inputs, "SkippedInputs": skipped, "SegmentMode": segment_mode, "ShotCount": shot_count,
                "SegmentMinS": round(min(lengths), 3), "SegmentMaxS": round(max(lengths), 3), "Stage": "done",
                **({"SegmentMap": segment_map} if segment_map else {}),
            },
        )
        print(f"Embedding task {task_id} completed: {done} vectors, dim {dim}")
        return {"statusCode": 200, "body": json.dumps({"task_id": task_id, "embeddings": done})}
    except Exception as exc:
        print(f"Embedding task {task_id} failed: {exc}\n{traceback.format_exc()}")
        if task_id:
            try:
                vectors.delete_index(f"emb-{task_id}")  # no partial index
                task_records.update_task(
                    task_id, TASK_TYPE, status="failed", finished=True,
                    result={"ErrorMessage": str(exc), "EmbeddingCount": 0},
                )
            except Exception as db_exc:  # noqa: BLE001
                print(f"Could not record failure: {db_exc}")
        return {"statusCode": 500, "body": json.dumps({"error": str(exc)})}
