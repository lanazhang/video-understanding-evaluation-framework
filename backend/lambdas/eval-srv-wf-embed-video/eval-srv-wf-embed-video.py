"""Embedding worker: cut the video into segments, embed each with the configured model, store the vectors.

Each segment is embedded from the inputs the user ticked (video, audio, image keyframe). With "combine" on, the
ticked inputs go into ONE request and the model pools them into one vector; with it off, every ticked input gets
its own vector. Vectors are tagged with the inputs they came from ("video", "audio+..."), which search can filter on.

Replaces Bedrock's async segmented-embedding job + the S3 listener that loaded the results into S3 Vectors.
"""
import json
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


def plan_jobs(segments, inputs, combine):
    """[(index, start, end, group)] where group is the tuple of inputs sent together for that vector."""
    groups = [tuple(inputs)] if (combine or len(inputs) == 1) else [(i,) for i in inputs]
    return [(idx, start, end, group) for idx, start, end in segments for group in groups]


def embed_one(provider, model_id, path, side, fps, group, idx, start, end, dimensions=None):
    """One vector for one segment from `group`. Returns None when the segment has no audio to embed."""
    label = "+".join(group)
    last_error = None
    for attempt_side in (side, max(224, side // 2)):  # a segment the server rejects (e.g. too many tokens) is retried smaller
        media = {}
        if "video" in group:
            media["video"] = video_frames.cut_segment(path, start, end - start, max_side=attempt_side, fps=fps)
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
        spec, provider = get_registry().resolve(model_id)
        side = int(params.get("SegmentMaxSide") or spec.extra.get("segment_max_side") or 480)
        fps = int(params.get("SegmentFps") or spec.extra.get("segment_fps") or 2)
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

            segments = plan_segments(duration, seg_s)
            jobs = plan_jobs(segments, inputs, combine)
            print(f"Embedding {len(segments)} segments of ~{seg_s}s: inputs={inputs} combine={combine} -> {len(jobs)} vectors with {model_id}")
            vectors.delete_index(index_name)  # re-runs start clean
            done, tokens, dim = 0, 0, 0
            workers = int(spec.extra.get("concurrency") or 2)
            pool = ThreadPoolExecutor(max_workers=workers)
            try:
                futures = [(job, pool.submit(embed_one, provider, model_id, path, side, fps, job[3], job[0], job[1], job[2], dimensions)) for job in jobs]
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
                "InputsEmbedded": inputs, "SkippedInputs": skipped,
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
