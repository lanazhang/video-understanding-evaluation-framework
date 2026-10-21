"""Model providers. NVIDIA (OpenAI-compatible NIM endpoints) is the default; see backend/models.yaml."""
from .registry import get_registry

__all__ = ["get_registry"]
