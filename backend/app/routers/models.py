import re
import time
import logging
import httpx
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models.platform_setting import PlatformSetting
from ..utils.dependencies import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

# Cache for Gemini API models (shared across requests)
_models_cache: dict = {"models": [], "fetched_at": 0}
_CACHE_TTL = 300  # 5 minutes


EXCLUDE_KEYWORDS = {
    "tts", "image", "robotics", "computer-use", "customtools",
    "banana", "latest", "embedding", "aqa",
}


def _fetch_gemini_models(api_key: str) -> list:
    """Fetch available models from Gemini API with caching."""
    global _models_cache

    now = time.time()
    if _models_cache["models"] and (now - _models_cache["fetched_at"]) < _CACHE_TTL:
        return _models_cache["models"]

    try:
        resp = httpx.get(
            "https://generativelanguage.googleapis.com/v1beta/models",
            params={"key": api_key},
            timeout=15,
        )
        if resp.status_code != 200:
            logger.warning(f"Gemini models API returned {resp.status_code}")
            return _models_cache["models"]  # return stale cache

        data = resp.json()
        models_list = []

        for model in data.get("models", []):
            name = model["name"].replace("models/", "")

            if not name.startswith("gemini-"):
                continue
            methods = model.get("supportedGenerationMethods", [])
            if "generateContent" not in methods:
                continue

            name_lower = name.lower()
            if any(kw in name_lower for kw in EXCLUDE_KEYWORDS):
                continue
            if name.endswith("-001"):
                continue

            version_match = re.search(r'gemini-(\d+(?:\.\d+)?)', name)
            if version_match:
                version = float(version_match.group(1))
                if version < 2.5:
                    continue

            display_name = model.get("displayName", name)
            models_list.append({
                "model_name": name,
                "display_name": display_name,
            })

        models_list.sort(key=lambda m: m["model_name"], reverse=True)
        _models_cache = {"models": models_list, "fetched_at": now}
        return models_list

    except Exception as e:
        logger.error(f"Failed to fetch Gemini models: {e}")
        return _models_cache["models"]


@router.get("/")
async def list_models(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """List available AI models from Gemini API, with is_default from platform settings."""
    # Get API key from platform_settings
    api_key_row = db.query(PlatformSetting).filter(
        PlatformSetting.key == "GEMINI_API_KEY"
    ).first()

    if not api_key_row or not api_key_row.value:
        # Fallback: use platform setting helper (checks DB then env)
        try:
            from ..services.gemini_client import _get_platform_setting
            api_key = _get_platform_setting("GEMINI_API_KEY")
        except Exception:
            api_key = None
    else:
        api_key = api_key_row.value

    if not api_key:
        return []

    models = _fetch_gemini_models(api_key)

    # Get default model from platform_settings
    default_row = db.query(PlatformSetting).filter(
        PlatformSetting.key == "DEFAULT_MODEL"
    ).first()
    default_model = default_row.value if default_row else None

    # Build response
    result = []
    for i, m in enumerate(models):
        is_default = (m["model_name"] == default_model) if default_model else (i == 0)
        result.append({
            "id": i + 1,
            "model_name": m["model_name"],
            "display_name": m["display_name"],
            "description": None,
            "is_active": True,
            "is_default": is_default,
        })

    return result
