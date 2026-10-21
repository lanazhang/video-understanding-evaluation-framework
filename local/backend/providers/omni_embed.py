"""Provider for the Omni-Embed-Nemotron-3B HTTP wrapper (text, image, audio and video -> one 2048-d vector).

Not OpenAI-compatible. API of the server (see omni_embed_server.py on the Brev instance):
    POST /embed  {"role": "query"|"document", "inputs": [{"text"?, "image"?, "video"?, "audio"?}]}   (media = base64)
              -> {"dim": 2048, "data": [{"embedding": [...]}]}
    GET  /info
Video and audio in one input item are encoded as separate streams and pooled into ONE vector.
"""
import base64
import json
import socket
import urllib.error
import urllib.request

from .errors import ConnectionFailed, RequestRejected


class OmniEmbedProvider:
    def __init__(self, name, base_url, timeout_s=300):
        if not base_url:
            raise ValueError(f"provider {name!r} has no base_url (set it in local/.env, see models.yaml)")
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
            if exc.code in (502, 503, 504):  # proxy/tunnel in front of a server that is not answering
                raise ConnectionFailed(f"{self.base_url}{path} -> HTTP {exc.code}") from exc
            raise RequestRejected(f"HTTP {exc.code}: {detail}") from exc
        except (urllib.error.URLError, socket.timeout, ConnectionError, TimeoutError) as exc:
            raise ConnectionFailed(f"{self.base_url}{path}: {getattr(exc, 'reason', exc)}") from exc

    @staticmethod
    def _fixed_size(dimensions):
        if dimensions:
            raise ValueError("the Omni-Embed server returns one fixed size (2048); it has no dimensions option")

    def _embed(self, role, item) -> list:
        resp = self._request("/embed", {"role": role, "inputs": [item]})
        return resp["data"][0]["embedding"]

    # -- the interface the embedding handlers use (same on every embedding provider) ----------------
    def embed_text(self, model, text, role="query", dimensions=None) -> list:
        self._fixed_size(dimensions)
        return self._embed(role, {"text": text})

    def embed_image(self, model, image_b64, fmt="jpeg", dimensions=None) -> list:
        self._fixed_size(dimensions)
        raw = image_b64.split(",", 1)[1] if image_b64.startswith("data:") else image_b64  # server wants no data-URL prefix
        return self._embed("document", {"image": raw})

    def embed_inputs(self, model, video=None, audio=None, image=None, dimensions=None) -> dict:
        """One vector from any combination of inputs (the server pools them). Each is raw bytes."""
        self._fixed_size(dimensions)
        item = {}
        for field, data in (("video", video), ("audio", audio), ("image", image)):
            if data:
                item[field] = base64.b64encode(data).decode()
        if not item:
            raise ValueError("embed_inputs needs at least one of video, audio, image")
        return {"embedding": self._embed("document", item), "promptTokens": 0}

    def embed_audio(self, model, audio_bytes) -> list:
        return self._embed("document", {"audio": base64.b64encode(audio_bytes).decode()})

    def embed_video(self, model, video_bytes, audio_bytes=None, dimensions=None) -> dict:
        self._fixed_size(dimensions)
        item = {"video": base64.b64encode(video_bytes).decode()}
        if audio_bytes:
            item["audio"] = base64.b64encode(audio_bytes).decode()
        return {"embedding": self._embed("document", item), "promptTokens": 0}  # the server does not report tokens

    def info(self) -> dict:
        return self._request("/info")
