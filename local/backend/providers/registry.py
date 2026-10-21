"""Loads local/models.yaml and resolves model ids to a provider + per-model settings."""
import os
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import yaml

from .omni_embed import OmniEmbedProvider
from .openai_compat import OpenAICompatProvider

_ENV = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}")

MODELS_FILE = Path(os.environ.get("MODELS_FILE") or Path(__file__).resolve().parents[2] / "models.yaml")


def _expand(value):
    if isinstance(value, str):
        return _ENV.sub(lambda m: os.environ.get(m.group(1)) or (m.group(2) or ""), value)
    if isinstance(value, dict):
        return {k: _expand(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_expand(v) for v in value]
    return value


@dataclass
class ModelSpec:
    id: str
    provider: str
    name: str = ""
    task: str = "video_understanding"
    video_input: str = "frames"
    max_frames: int = 32
    frame_max_side: int = 768
    max_tokens: int | None = None
    pricing: dict | None = None
    extra: dict = field(default_factory=dict)


class Registry:
    def __init__(self, raw: dict):
        raw = _expand(raw or {})
        self.provider_cfg: dict[str, dict] = raw.get("providers", {})
        self.models: dict[str, ModelSpec] = {}
        for m in raw.get("models", []):
            known = {f for f in ModelSpec.__dataclass_fields__ if f != "extra"}
            spec = ModelSpec(**{k: v for k, v in m.items() if k in known})
            spec.extra = {k: v for k, v in m.items() if k not in known}
            if spec.id:
                self.models[spec.id] = spec
        self._providers: dict[str, object] = {}
        self.default_provider = next((n for n, c in self.provider_cfg.items() if c.get("default")), None)

    def provider(self, name: str):
        if name not in self.provider_cfg:
            raise KeyError(f"unknown provider {name!r} in models.yaml")
        if name not in self._providers:
            cfg = self.provider_cfg[name]
            kind = cfg.get("type")
            if kind == "openai_compat":
                self._providers[name] = OpenAICompatProvider(
                    name=name,
                    base_url=cfg.get("base_url", ""),
                    api_key=os.environ.get(cfg.get("api_key_env", ""), ""),
                    api_key_required=bool(cfg.get("api_key_required", False)),
                    timeout_s=float(cfg.get("timeout_s", 600)),
                )
            elif kind == "omni_embed":
                self._providers[name] = OmniEmbedProvider(
                    name=name, base_url=cfg.get("base_url", ""), timeout_s=float(cfg.get("timeout_s", 300))
                )
            else:
                raise NotImplementedError(f"provider type {kind!r} is not supported by this runtime yet")
        return self._providers[name]

    def resolve(self, model_id: str):
        """Known model -> its provider. Unknown id -> default provider with default settings."""
        spec = self.models.get(model_id)
        if spec is None:
            if not self.default_provider:
                raise KeyError(f"model {model_id!r} is not in models.yaml and no default provider is set")
            spec = ModelSpec(id=model_id, provider=self.default_provider, name=model_id)
        return spec, self.provider(spec.provider)

    def describe(self) -> list[dict]:
        out = []
        for spec in self.models.values():
            cfg = self.provider_cfg.get(spec.provider, {})
            has_key = bool(os.environ.get(cfg.get("api_key_env", ""), ""))
            available = bool(cfg.get("base_url")) and (has_key or not cfg.get("api_key_required", False))
            out.append({
                "id": spec.id,
                "name": spec.name or spec.id,
                "provider": spec.provider,
                "task": spec.task,
                "apiType": "openai_compat" if spec.task == "video_understanding" else "embedding",
                "videoInput": spec.video_input,
                "dims": spec.extra.get("dims"),
                "maxClipSeconds": spec.extra.get("max_clip_seconds"),
                "parameters": spec.extra.get("parameters", []),
                "pricing": spec.pricing,
                "available": available,
                "default": spec.provider == self.default_provider,
            })
        return out


@lru_cache(maxsize=1)
def get_registry() -> Registry:
    with open(MODELS_FILE) as f:
        return Registry(yaml.safe_load(f))
