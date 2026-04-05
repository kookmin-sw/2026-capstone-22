import enum

from sqlalchemy import (
    Column,
    DateTime,
    Enum as SQLAlchemyEnum,
    ForeignKey,
    Integer,
    Text,
)
from sqlalchemy.sql import func

from ..database import Base


class HitlStatus(str, enum.Enum):
    pending = "pending"
    resolved = "resolved"


class HitlRequest(Base):
    __tablename__ = "hitl_requests"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    session_id = Column(
        Integer,
        ForeignKey("chat_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )

    # 스냅샷 복사: 세션/메시지 삭제 시에도 HITL 기록 독립 보존
    user_message = Column(Text, nullable=False)
    ai_response = Column(Text, nullable=True)
    hitl_reason = Column(Text, nullable=True)

    status = Column(
        SQLAlchemyEnum(HitlStatus, name="hitl_status"),
        default=HitlStatus.pending,
        nullable=False,
    )

    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolved_by = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
