import logging
from sqlalchemy.orm import Session
from ..models.usage import UsageRecord
from ..utils.pricing import estimate_cost, estimate_retrieval_cost

logger = logging.getLogger(__name__)


def record_usage(
    db: Session,
    tenant_id: int,
    call_type: str,
    model_name: str,
    response,
    user_id: int = None,
    session_id: int = None,
) -> None:
    """Extract usage_metadata from a Gemini/Vertex AI response and save to DB.

    Works with both google-genai SDK and Vertex AI SDK response objects.
    Fire-and-forget: never raises exceptions to avoid breaking chat flow.
    """
    try:
        prompt_tokens = 0
        completion_tokens = 0
        total_tokens = 0

        # Try google-genai SDK format
        usage = getattr(response, "usage_metadata", None)
        if usage:
            prompt_tokens = getattr(usage, "prompt_token_count", 0) or 0
            completion_tokens = getattr(usage, "candidates_token_count", 0) or 0
            total_tokens = getattr(usage, "total_token_count", 0) or 0

        # If total is 0 but we have parts, compute
        if total_tokens == 0 and (prompt_tokens or completion_tokens):
            total_tokens = prompt_tokens + completion_tokens

        # Skip if no token data at all
        if total_tokens == 0:
            return

        cost = estimate_cost(model_name, prompt_tokens, completion_tokens)

        record = UsageRecord(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=session_id,
            call_type=call_type,
            model_name=model_name,
            prompt_token_count=prompt_tokens,
            candidates_token_count=completion_tokens,
            total_token_count=total_tokens,
            estimated_cost_usd=cost,
        )
        db.add(record)
        db.commit()

        logger.debug(
            f"Usage recorded: tenant={tenant_id} type={call_type} "
            f"tokens={total_tokens} cost=${cost:.6f}"
        )
    except Exception as e:
        logger.warning(f"Failed to record usage: {e}")
        try:
            db.rollback()
        except Exception:
            pass


def record_retrieval_usage(
    db: Session,
    tenant_id: int,
    user_id: int = None,
    session_id: int = None,
    search_backend: str = "rag_engine",
) -> None:
    """Record a retrieval/search request cost.
    RAG Engine: ~$2.50 per 1K requests
    Vertex AI Search: ~$2.00 per 1K requests
    Fire-and-forget."""
    try:
        if search_backend == "vertex_ai_search":
            call_type = "vertex_ai_search"
            model_name = "vertex-ai-search"
            cost = 0.002  # ~$2.00 per 1K
        else:
            call_type = "rag_retrieval"
            model_name = "vertex-ai-rag-retrieval"
            cost = estimate_retrieval_cost(1)

        record = UsageRecord(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=session_id,
            call_type=call_type,
            model_name=model_name,
            prompt_token_count=0,
            candidates_token_count=0,
            total_token_count=0,
            estimated_cost_usd=cost,
        )
        db.add(record)
        db.commit()
    except Exception as e:
        logger.warning(f"Failed to record retrieval usage: {e}")
        try:
            db.rollback()
        except Exception:
            pass
