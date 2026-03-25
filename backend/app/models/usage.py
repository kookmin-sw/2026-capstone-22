from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Index
from sqlalchemy.sql import func
from ..database import Base


class UsageRecord(Base):
    __tablename__ = "usage_records"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id", ondelete="SET NULL"), nullable=True)

    # Type of AI call: "chat", "rag_search", "web_search", "file_chat", "function_calling", "synthesis"
    call_type = Column(String(50), nullable=False)
    model_name = Column(String(255), nullable=False)

    # Token counts from response.usage_metadata
    prompt_token_count = Column(Integer, default=0)
    candidates_token_count = Column(Integer, default=0)
    total_token_count = Column(Integer, default=0)

    # Estimated cost in USD
    estimated_cost_usd = Column(Float, default=0.0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_usage_tenant_date", "tenant_id", "created_at"),
    )
