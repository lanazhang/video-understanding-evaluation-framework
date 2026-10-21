"""Loads the unmodified Lambda handlers from source/eval_service/lambda and exposes the route table."""
import importlib.util
import sys
import threading
from types import ModuleType

import config

# Mirrors create_api_endpoint(...) calls in deployment/eval_service/eval_service_stack.py (all POST).
ROUTES = {
    "/v1/utils/manage-s3-presigned-url": "eval-srv-api-manage-s3-presigned-url",
    "/v1/utils/manage-api-key": "eval-srv-api-manage-api-key",
    "/v1/chatbot/converse": "eval-srv-api-chatbot-converse",
    "/v1/video/add-video": "eval-srv-add-video",
    "/v1/video/get-videos": "eval-srv-get-videos",
    "/v1/video/delete-video": "eval-srv-delete-video",
    "/v1/analyze/delete-analyze-task": "eval-srv-delete-analyze-task",
    "/v1/analyze/get-analyze-tasks": "eval-srv-get-analyze-tasks",
    "/v1/model/start-nova-mme": "eval-srv-api-start-nova-mme",
    "/v1/model/start-tlabs-mme": "eval-srv-api-start-tlabs-mme",
    # local runtime: provider-based embeddings (Qwen3-VL on Brev by default)
    "/v1/model/start-embedding": "eval-srv-api-start-embedding",
    "/v1/model/embedding-search": "eval-srv-api-embedding-search",
    "/v1/model/nova-mme-search-vector": "eval-srv-api-nova-mme-search-vector",
    "/v1/model/tlabs-mme-search-vector": "eval-srv-api-tlabs-mme-search-vector",
    "/v1/model/tlabs-pegasus": "eval-srv-api-tlabs-pegasus",
    "/v1/model/bedrock-converse": "eval-srv-api-bedrock-converse",
    "/v1/model/gemini": "eval-srv-api-gemini",
    "/v1/model/start-video-understanding": "eval-srv-api-start-video-understanding",
    "/v1/gt/upsert-ground-truth": "eval-srv-upsert-ground-truth",
    "/v1/gt/get-ground-truths": "eval-srv-get-ground-truths",
    "/v1/gt/delete-ground-truth": "eval-srv-delete-ground-truth",
    "/v1/eval/upsert-evaluation-task": "eval-srv-upsert-evaluation-task",
    "/v1/eval/get-evaluation-tasks": "eval-srv-get-evaluation-tasks",
    "/v1/eval/delete-evaluation-task": "eval-srv-delete-evaluation-task",
}

_modules: dict[str, ModuleType] = {}
_lock = threading.RLock()


def resolve_name(function_name: str) -> str:
    """Accepts a deployed name, an ARN, or a bare directory name."""
    name = function_name.rsplit(":", 1)[-1]
    if name.startswith(config.LAMBDA_NAME_PREFIX):
        name = name[len(config.LAMBDA_NAME_PREFIX):]
    return name


def load(name: str) -> ModuleType:
    """Import a handler module lazily, so one missing dependency only breaks its own routes."""
    with _lock:
        if name in _modules:
            return _modules[name]
        handler_dir = config.LAMBDA_DIR / name
        if not (handler_dir / f"{name}.py").is_file():
            handler_dir = config.LOCAL_HANDLERS_DIR / name  # handlers that only exist in the local runtime
        path = handler_dir / f"{name}.py"
        if not path.is_file():
            raise FileNotFoundError(f"No handler named '{name}'")
        # Several handlers ship their own sibling `utils.py`; isolate each one's import.
        sys.path.insert(0, str(handler_dir))
        sys.modules.pop("utils", None)
        try:
            spec = importlib.util.spec_from_file_location(name.replace("-", "_"), path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
        finally:
            sys.path.remove(str(handler_dir))
            sys.modules.pop("utils", None)
        _modules[name] = module
        return module


class LambdaContext:
    """Minimal stand-in for the Lambda context object."""

    def __init__(self, function_name: str):
        import uuid

        self.function_name = function_name
        self.aws_request_id = str(uuid.uuid4())
        self.memory_limit_in_mb = 1024

    def get_remaining_time_in_millis(self) -> int:
        return 15 * 60 * 1000


def invoke(function_name: str, event: dict):
    name = resolve_name(function_name)
    module = load(name)
    return module.lambda_handler(event, LambdaContext(name))
