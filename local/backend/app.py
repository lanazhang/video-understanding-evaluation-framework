"""FastAPI front for the Lambda handlers: one POST route per API Gateway endpoint.

Run from local/backend:  uvicorn app:app --port 8080
"""
import json
import os

import config
import local_aws

local_aws.install()  # must precede any handler import

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import RedirectResponse, Response  # noqa: E402

import handlers  # noqa: E402
from store import files_api  # noqa: E402

LOCAL_USERNAME = os.environ.get("LOCAL_USERNAME", "local-user")

app = FastAPI(title="Video Understanding Evaluation Framework (local)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["ETag"],  # multipart upload completion reads each part's ETag
)
app.include_router(files_api.router)


def _make_route(path: str, handler_name: str):
    def endpoint(request_body: bytes, headers: dict):
        event = {
            "httpMethod": "POST",
            "path": path,
            "headers": headers,
            "body": request_body.decode() if request_body else None,
            # Cognito authorizer claims, which several handlers read for the current user
            "requestContext": {"authorizer": {"claims": {"cognito:username": LOCAL_USERNAME}}},
        }
        return handlers.invoke(handler_name, event)

    async def route(request: Request):
        from starlette.concurrency import run_in_threadpool

        body = await request.body()
        try:
            result = await run_in_threadpool(endpoint, body, dict(request.headers))
        except FileNotFoundError as exc:
            return Response(json.dumps({"error": str(exc)}), status_code=404, media_type="application/json")
        except Exception as exc:  # import failures, unavailable backends, handler crashes
            return Response(
                json.dumps({"error": f"{type(exc).__name__}: {exc}"}), status_code=500, media_type="application/json"
            )
        # Mirror API Gateway's Lambda proxy integration
        extra = {k: v for k, v in (result.get("headers") or {}).items() if not k.lower().startswith("access-control")}
        return Response(
            content=result.get("body") or "",
            status_code=int(result.get("statusCode", 200)),
            media_type=extra.pop("Content-Type", "application/json"),
            headers=extra,
        )

    return route


for _path, _handler in handlers.ROUTES.items():
    app.add_api_route(_path, _make_route(_path, _handler), methods=["POST"], name=_handler)


@app.get("/", include_in_schema=False)
def root():
    # API only for now; the React UI is served separately (npm run dev)
    return RedirectResponse("/docs")


@app.get("/v1/model/list")
def list_models():
    """Models from local/models.yaml, with whether their provider is configured."""
    from providers import get_registry

    return {"models": get_registry().describe()}


@app.get("/health")
def health():
    return {"status": "ok", "routes": len(handlers.ROUTES)}
