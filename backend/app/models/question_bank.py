import enum

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Enum as SQLAlchemyEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..database import Base


class PaperStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    done = "done"
    failed = "failed"


class ReviewStatus(str, enum.Enum):
    pending = "pending"
    reviewed = "reviewed"


class ExamPaper(Base):
    __tablename__ = "exam_papers"

    __table_args__ = (
        Index("idx_exam_paper_tenant", "tenant_id"),
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(
        Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    title = Column(String(300), nullable=False)
    subject = Column(String(50), nullable=False, server_default="영어")
    source_year = Column(Integer, nullable=True)
    source_type = Column(String(50), nullable=True)  # csat / school / mock
    status = Column(
        SQLAlchemyEnum(PaperStatus, name="paper_status", create_type=False),
        nullable=False,
        server_default="pending",
    )
    total_questions = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    created_by = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    tenant = relationship("Tenant", back_populates="exam_papers")
    questions = relationship(
        "QuestionItem",
        back_populates="paper",
        cascade="all, delete-orphan",
        order_by="QuestionItem.question_number",
    )


class QuestionItem(Base):
    __tablename__ = "question_items"

    __table_args__ = (
        Index("idx_question_item_paper", "paper_id"),
        Index("idx_question_item_tenant_type", "tenant_id", "problem_type"),
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    paper_id = Column(
        BigInteger, ForeignKey("exam_papers.id", ondelete="CASCADE"), nullable=False
    )
    tenant_id = Column(
        Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    question_number = Column(Integer, nullable=False)
    area = Column(String(20), nullable=True)          # 듣기 / 독해
    problem_type = Column(String(50), nullable=True)  # 목적 파악, 빈칸 추론, ...
    concept_tag = Column(String(100), nullable=True)
    difficulty = Column(String(10), nullable=True)    # 하 / 중 / 상
    question_format = Column(String(20), nullable=True, server_default="객관식")
    is_listening = Column(Boolean, nullable=False, server_default="false")
    score_point = Column(Integer, nullable=True)      # 배점 (2 or 3)
    question_body = Column(Text, nullable=True)
    choices = Column(JSONB, nullable=True)            # ["①...", "②...", ...]
    answer = Column(String(10), nullable=True)
    raw_text = Column(Text, nullable=True)
    classifier_reason = Column(Text, nullable=True)
    review_status = Column(
        SQLAlchemyEnum(ReviewStatus, name="review_status", create_type=False),
        nullable=False,
        server_default="pending",
    )
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    paper = relationship("ExamPaper", back_populates="questions")
    tenant = relationship("Tenant")
