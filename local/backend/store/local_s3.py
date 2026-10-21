"""Filesystem stand-in for the boto3 S3 client.

Objects live at  <DATA_DIR>/files/<bucket>/<key>.  Presigned URLs point at this backend's /files route
(see files_api.py) and are HMAC-signed, including the S3 multipart upload protocol, so browsers can
keep using the same create -> PUT parts -> complete flow.
"""
import hashlib
import hmac
import io
import json
import mimetypes
import os
import secrets
import shutil
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urlencode

from botocore.exceptions import ClientError

from .sqlite_table import data_dir


def _error(code, message, op, status=None):
    resp = {"Error": {"Code": code, "Message": message}}
    if status:
        resp["ResponseMetadata"] = {"HTTPStatusCode": status}
    return ClientError(resp, op)


class NoSuchKey(ClientError):
    def __init__(self, key="", op="GetObject"):
        super().__init__({"Error": {"Code": "NoSuchKey", "Message": f"The specified key does not exist: {key}"}}, op)


class _Exceptions:
    NoSuchKey = NoSuchKey
    ClientError = ClientError


def files_root() -> Path:
    root = data_dir() / "files"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _uploads_root() -> Path:
    root = data_dir() / "uploads"
    root.mkdir(parents=True, exist_ok=True)
    return root


def object_path(bucket: str, key: str) -> Path:
    """Resolve an object path, refusing anything that escapes <files>/<bucket>."""
    base = (files_root() / bucket).resolve()
    path = (base / key).resolve()
    if base != path and base not in path.parents:
        raise _error("InvalidArgument", f"invalid object key: {key!r}", "Path", 400)
    return path


# -- signing --------------------------------------------------------------
def _secret() -> bytes:
    env = os.environ.get("FILE_SIGNING_SECRET")
    if env:
        return env.encode()
    path = data_dir() / ".signing_secret"
    if not path.exists():
        path.write_text(secrets.token_hex(32))
        path.chmod(0o600)
    return path.read_text().strip().encode()


def sign(op, bucket, key, exp, upload_id="", part=""):
    msg = "\n".join([op, bucket, key, str(exp), upload_id, str(part)])
    return hmac.new(_secret(), msg.encode(), hashlib.sha256).hexdigest()


def verify(op, bucket, key, exp, sig, upload_id="", part="") -> bool:
    try:
        if int(exp) < time.time():
            return False
    except (TypeError, ValueError):
        return False
    return hmac.compare_digest(sign(op, bucket, key, exp, upload_id, part), sig or "")


def public_base_url() -> str:
    return os.environ.get("PUBLIC_BASE_URL") or f"http://localhost:{os.environ.get('BACKEND_PORT', '8080')}"


def _etag(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return f'"{h.hexdigest()}"'


def _iso(ts):
    return datetime.fromtimestamp(ts, tz=timezone.utc)


class _Body:
    """Minimal botocore StreamingBody look-alike."""

    def __init__(self, path: Path):
        self._f = open(path, "rb")

    def read(self, amt=None):
        return self._f.read() if amt is None else self._f.read(amt)

    def iter_chunks(self, chunk_size=1024):
        while chunk := self._f.read(chunk_size):
            yield chunk

    def iter_lines(self, chunk_size=1024):
        yield from self._f.read().splitlines()

    def close(self):
        self._f.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


class _Paginator:
    def __init__(self, client):
        self._client = client

    def paginate(self, **kwargs):
        yield self._client.list_objects_v2(**kwargs)


class LocalS3Client:
    exceptions = _Exceptions

    # -- object operations ---------------------------------------------------
    def put_object(self, Bucket, Key, Body=b"", **_):
        path = object_path(Bucket, Key)
        path.parent.mkdir(parents=True, exist_ok=True)
        data = Body.encode() if isinstance(Body, str) else Body
        tmp = path.with_name(path.name + f".{uuid.uuid4().hex}.tmp")
        with open(tmp, "wb") as f:
            if isinstance(data, (bytes, bytearray)):
                f.write(data)
            else:
                shutil.copyfileobj(data, f)
        os.replace(tmp, path)
        return {"ETag": _etag(path)}

    def get_object(self, Bucket, Key, **_):
        path = object_path(Bucket, Key)
        if not path.is_file():
            raise NoSuchKey(Key)
        st = path.stat()
        return {
            "Body": _Body(path),
            "ContentLength": st.st_size,
            "ContentType": mimetypes.guess_type(Key)[0] or "application/octet-stream",
            "LastModified": _iso(st.st_mtime),
            "ETag": _etag(path),
        }

    def head_object(self, Bucket, Key, **_):
        path = object_path(Bucket, Key)
        if not path.is_file():
            raise _error("404", "Not Found", "HeadObject", 404)
        st = path.stat()
        return {
            "ContentLength": st.st_size,
            "ContentType": mimetypes.guess_type(Key)[0] or "application/octet-stream",
            "LastModified": _iso(st.st_mtime),
            "ETag": _etag(path),
        }

    def delete_object(self, Bucket, Key, **_):
        path = object_path(Bucket, Key)
        path.unlink(missing_ok=True)
        self._prune(path.parent, Bucket)
        return {}

    def delete_objects(self, Bucket, Delete, **_):
        deleted = []
        for obj in Delete.get("Objects", []):
            self.delete_object(Bucket, obj["Key"])
            deleted.append({"Key": obj["Key"]})
        return {"Deleted": deleted}

    def copy_object(self, Bucket, Key, CopySource, **_):
        if isinstance(CopySource, str):
            src_bucket, _, src_key = CopySource.lstrip("/").partition("/")
        else:
            src_bucket, src_key = CopySource["Bucket"], CopySource["Key"]
        src, dst = object_path(src_bucket, src_key), object_path(Bucket, Key)
        if not src.is_file():
            raise NoSuchKey(src_key, "CopyObject")
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
        return {"CopyObjectResult": {"ETag": _etag(dst)}}

    def upload_file(self, Filename, Bucket, Key, **_):
        dst = object_path(Bucket, Key)
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(Filename, dst)

    def upload_fileobj(self, Fileobj, Bucket, Key, **_):
        self.put_object(Bucket, Key, Fileobj)

    def download_file(self, Bucket, Key, Filename, **_):
        src = object_path(Bucket, Key)
        if not src.is_file():
            raise _error("404", "Not Found", "HeadObject", 404)
        shutil.copyfile(src, Filename)

    def download_fileobj(self, Bucket, Key, Fileobj, **_):
        with open(object_path(Bucket, Key), "rb") as f:
            shutil.copyfileobj(f, Fileobj)

    def list_objects_v2(self, Bucket, Prefix="", MaxKeys=1000, **_):
        base = (files_root() / Bucket).resolve()
        contents = []
        if base.is_dir():
            for p in sorted(base.rglob("*")):
                if p.is_file() and not p.name.endswith(".tmp"):
                    key = p.relative_to(base).as_posix()
                    if key.startswith(Prefix):
                        st = p.stat()
                        contents.append({"Key": key, "Size": st.st_size, "LastModified": _iso(st.st_mtime), "ETag": _etag(p)})
        contents = contents[:MaxKeys]
        out = {"KeyCount": len(contents), "IsTruncated": False}
        if contents:
            out["Contents"] = contents
        return out

    def get_paginator(self, operation):
        if operation != "list_objects_v2":
            raise NotImplementedError(f"paginator for {operation}")
        return _Paginator(self)

    @staticmethod
    def _prune(directory: Path, bucket: str):
        base = (files_root() / bucket).resolve()
        while directory != base and base in directory.parents:
            try:
                directory.rmdir()
            except OSError:
                break
            directory = directory.parent

    # -- presigned URLs ------------------------------------------------------
    def generate_presigned_url(self, ClientMethod, Params=None, ExpiresIn=3600, **_):
        params = Params or {}
        bucket, key = params["Bucket"], params["Key"]
        exp = int(time.time()) + int(ExpiresIn)
        op = {"get_object": "get", "put_object": "put", "upload_part": "part"}.get(ClientMethod)
        if op is None:
            raise NotImplementedError(f"presigned URL for {ClientMethod}")
        query = {"exp": exp}
        upload_id, part = params.get("UploadId", ""), params.get("PartNumber", "")
        if op == "part":
            query.update(uploadId=upload_id, partNumber=part)
        query["sig"] = sign(op, bucket, key, exp, upload_id, part)
        query["op"] = op
        return f"{public_base_url()}/files/{quote(bucket)}/{quote(key)}?{urlencode(query)}"

    # -- multipart upload ----------------------------------------------------
    def create_multipart_upload(self, Bucket, Key, **_):
        upload_id = uuid.uuid4().hex
        d = _uploads_root() / upload_id
        d.mkdir(parents=True)
        (d / "meta.json").write_text(json.dumps({"Bucket": Bucket, "Key": Key}))
        return {"Bucket": Bucket, "Key": Key, "UploadId": upload_id}

    def _upload_dir(self, upload_id, bucket, key) -> Path:
        d = _uploads_root() / upload_id
        meta = d / "meta.json"
        if not upload_id.isalnum() or not meta.is_file() or json.loads(meta.read_text()) != {"Bucket": bucket, "Key": key}:
            raise _error("NoSuchUpload", "The specified upload does not exist", "UploadPart", 404)
        return d

    def part_path(self, upload_id, bucket, key, part_number) -> Path:
        return self._upload_dir(upload_id, bucket, key) / f"part-{int(part_number):05d}"

    def complete_multipart_upload(self, Bucket, Key, UploadId, MultipartUpload, **_):
        d = self._upload_dir(UploadId, Bucket, Key)
        dst = object_path(Bucket, Key)
        dst.parent.mkdir(parents=True, exist_ok=True)
        tmp = dst.with_name(dst.name + f".{uuid.uuid4().hex}.tmp")
        try:
            with open(tmp, "wb") as out:
                for part in sorted(MultipartUpload["Parts"], key=lambda p: int(p["PartNumber"])):
                    src = d / f"part-{int(part['PartNumber']):05d}"
                    if not src.is_file():
                        raise _error("InvalidPart", f"part {part['PartNumber']} was not uploaded", "CompleteMultipartUpload", 400)
                    with open(src, "rb") as f:
                        shutil.copyfileobj(f, out)
            os.replace(tmp, dst)
        finally:
            tmp.unlink(missing_ok=True)
        shutil.rmtree(d, ignore_errors=True)
        return {"Bucket": Bucket, "Key": Key, "ETag": _etag(dst)}

    def abort_multipart_upload(self, Bucket, Key, UploadId, **_):
        shutil.rmtree(self._upload_dir(UploadId, Bucket, Key), ignore_errors=True)
        return {}


__all__ = ["LocalS3Client", "NoSuchKey", "object_path", "verify", "files_root"]
