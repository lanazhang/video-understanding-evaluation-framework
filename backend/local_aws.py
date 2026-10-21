"""Redirects the handlers' boto3 calls to local implementations without editing the handlers.

- boto3.resource('dynamodb') -> SQLite  (store/sqlite_table.py)
- boto3.client('s3')         -> local filesystem + signed URLs  (store/local_s3.py)
- boto3.client('lambda')     -> in-process handler calls; async 'Event' invokes run on a thread pool
- boto3.dynamodb.conditions  -> store/conditions.py (Key / Attr)
- s3vectors, secretsmanager  -> stubs that fail loudly until their local replacements land

Other services (e.g. bedrock-runtime) are untouched and use the normal AWS credential chain, so
AWS stays available as an optional model provider.
"""
import io
import json
import os
import sys
import traceback
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

import boto3

import handlers
from store import conditions, schema, vectors
from store.local_s3 import LocalS3Client
from store.sqlite_table import Resource

_orig_client = boto3.client
_orig_resource = boto3.resource

_pool = ThreadPoolExecutor(max_workers=int(os.environ.get("LOCAL_INVOKE_WORKERS", "4")), thread_name_prefix="lambda-event")


def _json_default(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    return str(obj)


class LocalLambdaClient:
    def invoke(self, FunctionName, InvocationType="RequestResponse", Payload=b"{}", **_):
        event = json.loads(Payload) if Payload else {}
        if InvocationType == "Event":
            _pool.submit(self._run_async, FunctionName, event)
            return {"StatusCode": 202, "Payload": io.BytesIO(b"")}
        result = handlers.invoke(FunctionName, event)
        return {"StatusCode": 200, "Payload": io.BytesIO(json.dumps(result, default=_json_default).encode())}

    @staticmethod
    def _run_async(function_name, event):
        try:
            handlers.invoke(function_name, event)
        except Exception:
            print(f"[local-lambda] async invoke of {function_name} failed:\n{traceback.format_exc()}")


class _UnavailableClient:
    def __init__(self, service, hint):
        self._service, self._hint = service, hint

    def __getattr__(self, name):
        if name == "exceptions":
            # handlers write `except client.exceptions.X`; give them a class that never matches
            return type("_NoExceptions", (), {"__getattr__": lambda self, n: type(n, (Exception,), {})})()

        def _fail(*_, **__):
            raise NotImplementedError(f"{self._service}.{name} is not available locally yet: {self._hint}")

        return _fail


class LocalS3Vectors:
    """The slice of the S3 Vectors API the delete handlers use, backed by store/vectors.py."""

    class exceptions:
        class NotFoundException(Exception):
            pass

        class ResourceNotFoundException(Exception):
            pass

    def delete_index(self, vectorBucketName=None, indexName=None, **_):
        if not vectors.delete_index(indexName):
            raise self.exceptions.NotFoundException(f"index {indexName} not found")
        return {}

    def delete_vectors(self, vectorBucketName=None, indexName=None, keys=(), **_):
        return {}

    def __getattr__(self, name):
        def _fail(*_, **__):
            raise NotImplementedError(f"s3vectors.{name} is not available locally; embeddings use store/vectors.py")

        return _fail


_LAMBDA = LocalLambdaClient()
_S3 = LocalS3Client()
_S3VECTORS = LocalS3Vectors()
_DDB = Resource()
_STUBS = {
    "secretsmanager": "API keys move to the local settings store",
    "dynamodb": "use boto3.resource('dynamodb') (SQLite) instead",
}


def _client(service_name, *args, **kwargs):
    if service_name == "lambda":
        return _LAMBDA
    if service_name == "s3":
        return _S3
    if service_name == "s3vectors":
        return _S3VECTORS
    if service_name in _STUBS:
        return _UnavailableClient(service_name, _STUBS[service_name])
    return _orig_client(service_name, *args, **kwargs)


def _resource(service_name, *args, **kwargs):
    if service_name == "dynamodb":
        return _DDB
    if service_name == "s3":
        raise NotImplementedError("use boto3.client('s3')")
    return _orig_resource(service_name, *args, **kwargs)


def install():
    schema.setup()
    boto3.client = _client
    boto3.resource = _resource
    # `from boto3.dynamodb.conditions import Key, Attr` in the handlers resolves to our classes
    sys.modules["boto3.dynamodb.conditions"] = conditions
