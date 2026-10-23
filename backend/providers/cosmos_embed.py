"""Provider for the NVIDIA Cosmos-Embed1 NIM (text and short video -> one 256-d vector in a shared space).

Close to the OpenAI embeddings route but not the same, which is why this is not `openai_compat`:
    POST /v1/embeddings  {"model": "nvidia/cosmos-embed1", "input": <text | "data:video/mp4;base64,...">, "request_type": "query"}
                      -> {"data": [{"embedding": [...]}], "usage": {"num_videos", "prompt_tokens", "total_tokens"}}
    GET  /v1/health/ready
`request_type` is required (query for a single item), and a `dimensions` field is rejected: the size is fixed at 256 and
the vectors come back unit length. Only text and video are supported (no audio, no image).
"""
import base64
import json
import socket
import urllib.error
import urllib.request

from .errors import ConnectionFailed, RequestRejected


class CosmosEmbedProvider:
    def __init__(self, name, base_url, timeout_s=300):
        if not base_url:
            raise ValueError(f"provider {name!r} has no base_url (set it in backend/.env, see models.yaml)")
        self.name = name
        self.base_url = base_url.rstrip("/")
        self.timeout_s = timeout_s

    def _request(self, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(
            self.base_url + path, data=data, headers={"Content-Type": "application/json"}, method="POST" if body is not None else "GET"
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")[:300]
            if exc.code in (502, 503, 504):  # a tunnel or proxy in front of a server that is not answering
                raise ConnectionFailed(f"{self.base_url}{path} -> HTTP {exc.code}") from exc
            raise RequestRejected(f"HTTP {exc.code}: {detail}") from exc
        except (urllib.error.URLError, socket.timeout, ConnectionError, TimeoutError) as exc:
            raise ConnectionFailed(f"{self.base_url}{path}: {getattr(exc, 'reason', exc)}") from exc

    @staticmethod
    def _fixed_size(dimensions):
        if dimensions:
            raise ValueError("the Cosmos-Embed1 NIM returns one fixed size (256); it rejects a dimensions option")

    def _embed(self, model, item) -> dict:
        resp = self._request("/v1/embeddings", {"model": model, "input": item, "request_type": "query"})
        return {"embedding": resp["data"][0]["embedding"], "promptTokens": int((resp.get("usage") or {}).get("prompt_tokens") or 0)}

    # -- the interface the embedding handlers use (same on every embedding provider) ----------------
    def embed_text(self, model, text, role="query", dimensions=None) -> list:
        self._fixed_size(dimensions)
        return self._embed(model, text)["embedding"]

    def embed_image(self, model, image_b64, fmt="jpeg", dimensions=None) -> list:
        raise ValueError("Cosmos-Embed1 embeds text and video only; search with a text query")

    def embed_inputs(self, model, video=None, audio=None, image=None, dimensions=None) -> dict:
        """One vector for a video segment (raw mp4 bytes). Audio and image inputs are not supported by the model."""
        self._fixed_size(dimensions)
        if audio or image:
            raise ValueError("Cosmos-Embed1 embeds video only; untick audio and image keyframe inputs")
        if not video:
            raise ValueError("embed_inputs needs a video")
        return self._embed(model, "data:video/mp4;base64," + base64.b64encode(video).decode())

    def embed_video(self, model, video_bytes, audio_bytes=None, dimensions=None) -> dict:
        return self.embed_inputs(model, video=video_bytes, audio=audio_bytes, dimensions=dimensions)
