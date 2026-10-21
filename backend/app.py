"""FastAPI front for the Lambda handlers: one POST route per API Gateway endpoint.

Run from backend/:  uvicorn app:app --port 8080
"""
import json
import os

import config
import local_aws

local_aws.install()  # must precede any handler import

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse, RedirectResponse, Response  # noqa: E402
from urllib.parse import urlparse  # noqa: E402

import handlers  # noqa: E402
from store import files_api  # noqa: E402

LOCAL_USERNAME = os.environ.get("LOCAL_USERNAME", "local-user")

app = FastAPI(title="Video Understanding Evaluation Framework (local)")

# This API has no login (it is a single-user local app), so it must not be drivable by other web pages:
#  - Host check: only localhost names (plus ALLOWED_HOSTS and the PUBLIC_BASE_URL host) are served, which stops DNS rebinding.
#  - Cross-site check: a write needs Content-Type: application/json, which makes browsers send a CORS preflight, and an
#    Origin header, when present, must be one of CORS_ORIGINS. Without this any website could POST "simple" requests here.
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
ALLOWED_HOSTS = {"localhost", "127.0.0.1", "[::1]"} | {h.strip().lower() for h in os.environ.get("ALLOWED_HOSTS", "").split(",") if h.strip()}
if os.environ.get("PUBLIC_BASE_URL"):
    ALLOWED_HOSTS.add((urlparse(os.environ["PUBLIC_BASE_URL"]).hostname or "").lower())


def _hostname(host_header: str) -> str:
    host = host_header.strip().lower()
    if host.startswith("["):  # IPv6 literal
        return host.split("]")[0] + "]"
    return host.rsplit(":", 1)[0] if ":" in host else host


@app.middleware("http")
async def guard(request: Request, call_next):
    if _hostname(request.headers.get("host", "")) not in ALLOWED_HOSTS:
        return JSONResponse({"error": "Host not allowed (set ALLOWED_HOSTS)"}, status_code=403)
    if request.url.path.startswith("/v1/") and request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")
        if origin is not None and origin not in CORS_ORIGINS:
            return JSONResponse({"error": "Origin not allowed (set CORS_ORIGINS)"}, status_code=403)
        if request.headers.get("content-type", "").split(";")[0].strip().lower() != "application/json":
            return JSONResponse({"error": "Content-Type must be application/json"}, status_code=415)
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
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
    """Models from backend/models.yaml, with whether their provider is configured."""
    from providers import get_registry

    return {"models": get_registry().describe()}


@app.get("/health")
def health():
    return {"status": "ok", "routes": len(handlers.ROUTES)}
