"""Chat history management utilities"""
from typing import List, Dict
from sqlalchemy.orm import Session
from ..models.chat import Message, MessageRole
import logging

logger = logging.getLogger(__name__)


def estimate_tokens(text: str) -> int:
    """Estimate token count for text

    Simple estimation: ~4 characters per token for English/Korean mix
    This is a rough estimate. For accurate counting, use tiktoken or similar.
    """
    return len(text) // 4


def get_conversation_history(
    session_id: int,
    db: Session,
    max_messages: int = 20,
    max_tokens: int = 8000
) -> List[Dict]:
    """Get conversation history with smart truncation

    Args:
        session_id: Chat session ID
        db: Database session
        max_messages: Maximum number of messages to include (default 20)
        max_tokens: Maximum total tokens to include (default 8000)

    Returns:
        List of message dicts in Gemini format: [{"role": "user", "parts": [{"text": "..."}]}, ...]
    """
    # Get recent messages from DB (ordered by newest first)
    messages = db.query(Message).filter(
        Message.session_id == session_id
    ).order_by(Message.timestamp.desc()).limit(max_messages).all()

    if not messages:
        return []

    # Reverse to chronological order (oldest first)
    messages = list(reversed(messages))

    # Build conversation with token limit
    conversation = []
    total_tokens = 0

    for msg in messages:
        msg_tokens = estimate_tokens(msg.content)

        # Stop if adding this message exceeds token limit
        if total_tokens + msg_tokens > max_tokens:
            logger.info(f"Truncating history at {len(conversation)} messages due to token limit")
            break

        # Convert role: "assistant" -> "model" for Gemini API
        gemini_role = "model" if msg.role.value == "assistant" else msg.role.value

        # Convert to Gemini format
        conversation.append({
            "role": gemini_role,  # "user" or "model"
            "parts": [{"text": msg.content}]
        })

        total_tokens += msg_tokens

    logger.info(f"Loaded {len(conversation)} messages (~{total_tokens} tokens) for session {session_id}")
    return conversation


def should_use_caching(conversation_length: int, total_tokens: int) -> bool:
    """Determine if context caching should be used

    Caching is beneficial when:
    - Conversation has 5+ messages
    - Total tokens > 2000

    Args:
        conversation_length: Number of messages in conversation
        total_tokens: Estimated total tokens

    Returns:
        True if caching should be used
    """
    return conversation_length >= 5 and total_tokens >= 2000
