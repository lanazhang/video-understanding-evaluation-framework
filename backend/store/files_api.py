"""HTTP side of the local S3: signed GET (with Range) and PUT (whole object or multipart part)."""
import hashlib
import os
import uuid

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, Response

from . import local_s3

router = APIRouter()
client = local_s3.LocalS3Client()

_CHUNK_LIMIT = int(os.environ.get("MAX_UPLOAD_BYTES", str(20 * 1024**3)))


def _authorize(op, bucket, key, request: Request):
    try:
        local_s3.check_bucket(bucket)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid bucket")
    q = request.query_params
    if q.get("op") != op or not local_s3.verify(op, bucket, key, q.get("exp"), q.get("sig"), q.get("uploadId", ""), q.get("partNumber", "")):
        raise HTTPException(status_code=403, detail="Invalid or expired signature")


@router.api_route("/files/{bucket}/{key:path}", methods=["GET", "HEAD"])
def get_file(bucket: str, key: str, request: Request):
    _authorize("get", bucket, key, request)
    path = local_s3.object_path(bucket, key)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    # Starlette's FileResponse handles Range requests, which the <video> element needs for seeking.
    return FileResponse(path, headers={"Cache-Control": "private, max-age=3600"})


@router.put("/files/{bucket}/{key:path}")
async def put_file(bucket: str, key: str, request: Request):
    q = request.query_params
    op = q.get("op")
    if op not in ("put", "part"):
        raise HTTPException(status_code=403, detail="Invalid or expired signature")
    _authorize(op, bucket, key, request)

    if op == "part":
        try:
            dst = client.part_path(q["uploadId"], bucket, key, q["partNumber"])
        except Exception as exc:
            raise HTTPException(status_code=404, detail=str(exc))
    else:
        dst = local_s3.object_path(bucket, key)
        dst.parent.mkdir(parents=True, exist_ok=True)

    tmp = dst.with_name(dst.name + f".{uuid.uuid4().hex}.tmp")
    md5, size = hashlib.md5(usedforsecurity=False), 0  # S3-style ETag, not a security use
    try:
        with open(tmp, "wb") as f:
            async for chunk in request.stream():
                size += len(chunk)
                if size > _CHUNK_LIMIT:
                    raise HTTPException(status_code=413, detail="Upload too large")
                md5.update(chunk)
                f.write(chunk)
        os.replace(tmp, dst)
    finally:
        if tmp.exists():
            tmp.unlink()
    # The browser upload code reads this header to complete the multipart upload.
    return Response(status_code=200, headers={"ETag": f'"{md5.hexdigest()}"'})
