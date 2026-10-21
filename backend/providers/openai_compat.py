"""OpenAI-compatible chat provider: NVIDIA NIM (Brev / build.nvidia.com / LAN), vLLM, Ollama, OpenAI."""
import base64

import openai
from openai import OpenAI

from .errors import ConnectionFailed, RequestRejected


class OpenAICompatProvider:
    def __init__(self, name, base_url, api_key="", api_key_required=False, timeout_s=600, max_retries=3):
        if not base_url:
            raise ValueError(f"provider {name!r} has no base_url (set it in backend/.env, see models.yaml)")
        if api_key_required and not api_key:
            raise ValueError(f"provider {name!r} needs an API key (see api_key_env in models.yaml)")
        self.name = name
        self.base_url = base_url
        # The SDK requires a non-empty key even when the server ignores it
        self._client = OpenAI(base_url=base_url, api_key=api_key or "not-used", timeout=timeout_s, max_retries=max_retries)

    def chat(self, model, messages, temperature=None, max_tokens=None, top_p=None, extra_body=None) -> dict:
        """Returns {content, usage{inputTokens,outputTokens,totalTokens}, stopReason, role} (Bedrock-Converse-like)."""
        params = {"model": model, "messages": messages}
        if temperature is not None:
            params["temperature"] = float(temperature)
        if max_tokens is not None:
            params["max_tokens"] = int(max_tokens)
        if top_p is not None:
            params["top_p"] = float(top_p)
        if extra_body:
            params["extra_body"] = extra_body
        resp = self._client.chat.completions.create(**params)
        choice = resp.choices[0]
        usage = resp.usage
        return {
            "role": choice.message.role or "assistant",
            "content": choice.message.content or "",
            "stopReason": choice.finish_reason or "unknown",
            "usage": {
                "inputTokens": getattr(usage, "prompt_tokens", 0) or 0,
                "outputTokens": getattr(usage, "completion_tokens", 0) or 0,
                "totalTokens": getattr(usage, "total_tokens", 0) or 0,
            },
        }

    def embed(self, model, input=None, messages=None, dimensions=None) -> dict:
        """POST /embeddings. Text goes in `input`; images/videos go in chat-style `messages` (vLLM multimodal
        embedding models). `dimensions` asks the SERVER for a smaller size (only if it supports it); the vector is
        returned exactly as the server produced it. Returns {embedding: [...], promptTokens: int}."""
        body = {"model": model}
        if dimensions:
            body["dimensions"] = int(dimensions)
        if messages is not None:
            body["messages"] = messages
        else:
            body["input"] = input
        try:
            resp = self._client.post("/embeddings", body=body, cast_to=object)
        except openai.APIConnectionError as exc:  # includes timeouts
            raise ConnectionFailed(f"{self.base_url}: {exc}") from exc
        except openai.BadRequestError as exc:  # typically the context-length limit
            raise RequestRejected(str(exc)) from exc
        except openai.NotFoundError as exc:
            raise RequestRejected(
                f"{self.base_url}/embeddings answered 404: that server does not serve embeddings. Is something else "
                f"listening on this port (check `lsof -nP -iTCP:<port> -sTCP:LISTEN`) or is the model id wrong? ({exc})"
            ) from exc
        vector = resp["data"][0]["embedding"]
        if dimensions and len(vector) != int(dimensions):
            raise RequestRejected(f"asked the server for {dimensions} dimensions but it returned {len(vector)}")
        return {"embedding": vector, "promptTokens": (resp.get("usage") or {}).get("prompt_tokens", 0)}

    # -- the interface the embedding handlers use (same on every embedding provider) ----------------
    def embed_text(self, model, text, role="query", dimensions=None) -> list:
        return self.embed(model, input=text, dimensions=dimensions)["embedding"]

    def embed_image(self, model, image_b64, fmt="jpeg", dimensions=None) -> list:
        url = image_b64 if image_b64.startswith("data:") else f"data:image/{fmt};base64,{image_b64}"
        content = [{"type": "image_url", "image_url": {"url": url}}]
        return self.embed(model, messages=[{"role": "user", "content": content}], dimensions=dimensions)["embedding"]

    def embed_inputs(self, model, video=None, audio=None, image=None, dimensions=None) -> dict:
        """These endpoints take ONE image or ONE video per request, and no audio."""
        if audio:
            raise NotImplementedError("audio embedding is not supported by OpenAI-compatible embedding endpoints")
        if video and image:
            raise NotImplementedError("this endpoint takes one image OR one video per request; create them as separate vectors")
        if video:
            return self.embed_video(model, video, dimensions=dimensions)
        if image:
            return {"embedding": self.embed_image(model, base64.b64encode(image).decode(), dimensions=dimensions), "promptTokens": 0}
        raise ValueError("embed_inputs needs a video or an image")

    def embed_audio(self, model, audio_bytes) -> list:
        raise NotImplementedError("audio embedding is not supported by OpenAI-compatible embedding endpoints")

    def embed_video(self, model, video_bytes, audio_bytes=None, dimensions=None) -> dict:
        """Audio is not supported by these endpoints and is ignored."""
        url = "data:video/mp4;base64," + base64.b64encode(video_bytes).decode()
        content = [{"type": "video_url", "video_url": {"url": url}}]
        return self.embed(model, messages=[{"role": "user", "content": content}], dimensions=dimensions)

    def list_models(self) -> list[str]:
        return [m.id for m in self._client.models.list().data]
