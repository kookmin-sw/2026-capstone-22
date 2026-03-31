# Vertex AI Gemini model pricing per 1M tokens (USD)
# Source: https://cloud.google.com/vertex-ai/generative-ai/pricing
# Updated: 2026-03
MODEL_PRICING = {
    # Gemini 2.5 Flash (Vertex AI pricing)
    "gemini-2.5-flash": {"input": 0.30, "output": 2.50},
    "gemini-2.5-flash-preview-05-20": {"input": 0.30, "output": 2.50},
    # Gemini 2.5 Pro
    "gemini-2.5-pro": {"input": 1.25, "output": 10.00},
    "gemini-2.5-pro-preview-05-06": {"input": 1.25, "output": 10.00},
    # Gemini 2.5 Flash Lite
    "gemini-2.5-flash-lite": {"input": 0.10, "output": 0.40},
    "gemini-2.5-flash-lite-preview-06-17": {"input": 0.10, "output": 0.40},
    # Gemini 2.0 Flash
    "gemini-2.0-flash": {"input": 0.15, "output": 0.60},
    "gemini-2.0-flash-001": {"input": 0.15, "output": 0.60},
    # Gemini 2.0 Flash Lite
    "gemini-2.0-flash-lite": {"input": 0.075, "output": 0.30},
    # Gemini 3.x (preview)
    "gemini-3-flash-preview": {"input": 0.30, "output": 2.50},
    "gemini-3.1-flash-lite-preview": {"input": 0.25, "output": 1.50},
    "gemini-3.1-pro-preview": {"input": 2.00, "output": 12.00},
}

# Default pricing for unknown models (conservative estimate)
DEFAULT_PRICING = {"input": 0.30, "output": 2.50}

# Embedding model pricing per 1M tokens
EMBEDDING_PRICE_PER_1M_TOKENS = 0.10  # text-embedding-005

# RAG retrieval pricing (Grounding with Your Data)
RAG_RETRIEVAL_PRICE_PER_1K_REQUESTS = 2.50

# GCS storage pricing
GCS_PRICE_PER_GB_MONTH = 0.020  # Standard storage, USD per GB per month

# Average tokens per byte for text documents (rough estimate for embedding cost)
# ~1 token per 4 bytes for English, ~1 token per 3 bytes for Korean
AVG_TOKENS_PER_BYTE = 0.30


def estimate_cost(model_name: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Estimate USD cost for a single API call based on token counts."""
    pricing = MODEL_PRICING.get(model_name, DEFAULT_PRICING)
    input_cost = (prompt_tokens / 1_000_000) * pricing["input"]
    output_cost = (completion_tokens / 1_000_000) * pricing["output"]
    return round(input_cost + output_cost, 8)


def estimate_embedding_cost(file_size_bytes: int) -> float:
    """Estimate embedding cost for a file upload to RAG corpus.
    Since import_files doesn't return token count, estimate from file size."""
    estimated_tokens = file_size_bytes * AVG_TOKENS_PER_BYTE
    cost = (estimated_tokens / 1_000_000) * EMBEDDING_PRICE_PER_1M_TOKENS
    return round(cost, 8)


def estimate_retrieval_cost(request_count: int) -> float:
    """Estimate RAG retrieval cost."""
    return round((request_count / 1000) * RAG_RETRIEVAL_PRICE_PER_1K_REQUESTS, 6)


def estimate_storage_cost(bytes_used: int) -> float:
    """Estimate monthly GCS storage cost in USD."""
    gb_used = bytes_used / (1024**3)
    return round(gb_used * GCS_PRICE_PER_GB_MONTH, 6)
