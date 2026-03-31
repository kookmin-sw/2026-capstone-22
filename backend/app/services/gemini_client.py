"""Gemini/Vertex AI client initialization and shared utilities"""

from google import genai
from google.genai import types
from typing import Optional
import logging
import re
import os
import vertexai
from vertexai import rag
from ..config import settings

logger = logging.getLogger(__name__)


# metadata.json 파일 패턴 (정규식)
METADATA_JSON_PATTERN = re.compile(r"metadata.*\.json$", re.IGNORECASE)


def _is_metadata_file(filename: str) -> bool:
    """metadata.json 파일인지 확인"""
    return bool(METADATA_JSON_PATTERN.search(filename))


# --- Platform settings helper (DB > env fallback) ---


def _get_platform_setting(key: str) -> str:
    """Get platform setting value: DB first, then env var fallback.

    Uses a short-lived DB session to query platform_settings table.
    Falls back to env var if DB value is not set or on error.
    """
    env_value = getattr(settings, key, "") or ""
    try:
        from ..database import SessionLocal
        from ..models.platform_setting import PlatformSetting

        db = SessionLocal()
        try:
            row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
            if row and row.value:
                return row.value
        finally:
            db.close()
    except Exception:
        pass  # DB not ready or table doesn't exist yet — use env
    return env_value


# Initialize Gemini client (legacy — kept for hybrid search / web search / file chat)
_cached_genai_client = None
_cached_genai_api_key = None


def _get_genai_client():
    """Get or refresh Gemini client. Re-creates only when API key changes."""
    global _cached_genai_client, _cached_genai_api_key
    api_key = _get_platform_setting("GEMINI_API_KEY")
    if not api_key:
        _cached_genai_client = None
        _cached_genai_api_key = None
        return None
    if api_key != _cached_genai_api_key:
        _cached_genai_client = genai.Client(api_key=api_key)
        _cached_genai_api_key = api_key
        logger.info("Gemini client (re)initialized with updated API key")
    return _cached_genai_client


# Module-level property-like access — always use _get_genai_client()
client = _get_genai_client()

# --- Vertex AI RAG initialization ---
_vertex_ai_initialized = False


def _ensure_credentials():
    """Ensure GCP credentials are set (once)."""
    global _vertex_ai_initialized
    if _vertex_ai_initialized:
        return
    credentials_path = _get_platform_setting("GCP_CREDENTIALS_PATH")
    if credentials_path and os.path.exists(credentials_path):
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = credentials_path
    _vertex_ai_initialized = True


def _init_vertex_ai():
    """Initialize Vertex AI SDK with RAG corpus location (asia-northeast3 etc).
    Call this before any RAG corpus operations (create, upload, search, delete).
    """
    _ensure_credentials()
    project_id = _get_platform_setting("VERTEX_AI_PROJECT_ID")
    location = _get_platform_setting("VERTEX_AI_LOCATION") or "asia-northeast3"

    if not project_id:
        logger.warning("VERTEX_AI_PROJECT_ID not set, Vertex AI RAG disabled")
        return

    vertexai.init(project=project_id, location=location)
    logger.debug(f"Vertex AI initialized: project={project_id}, location={location}")


def _init_vertex_ai_global():
    """Initialize Vertex AI SDK with global location for model inference.
    Call this before GenerativeModel calls (supports preview models).
    """
    _ensure_credentials()
    project_id = _get_platform_setting("VERTEX_AI_PROJECT_ID")
    if project_id:
        vertexai.init(project=project_id, location="global")


def _get_vertex_project() -> str:
    return _get_platform_setting("VERTEX_AI_PROJECT_ID") or ""


def _get_vertex_location() -> str:
    return _get_platform_setting("VERTEX_AI_LOCATION") or "asia-northeast3"


def _get_model_generation_params() -> dict:
    """Load model generation parameters from platform_settings.
    Returns a dict suitable for GenerateContentConfig kwargs."""
    params = {}

    temp = _get_platform_setting("MODEL_TEMPERATURE")
    if temp:
        try:
            params["temperature"] = float(temp)
        except (ValueError, TypeError):
            pass

    top_k = _get_platform_setting("MODEL_TOP_K")
    if top_k:
        try:
            params["top_k"] = int(top_k)
        except (ValueError, TypeError):
            pass

    top_p = _get_platform_setting("MODEL_TOP_P")
    if top_p:
        try:
            params["top_p"] = float(top_p)
        except (ValueError, TypeError):
            pass

    max_tokens = _get_platform_setting("MODEL_MAX_OUTPUT_TOKENS")
    if max_tokens:
        try:
            params["max_output_tokens"] = int(max_tokens)
        except (ValueError, TypeError):
            pass

    thinking_budget = _get_platform_setting("MODEL_THINKING_BUDGET")
    if thinking_budget:
        try:
            budget = int(thinking_budget)
            if budget > 0:
                params["thinking_config"] = types.ThinkingConfig(
                    thinking_budget=budget,
                )
        except (ValueError, TypeError):
            pass

    return params


# Initialize on module load
_init_vertex_ai()
