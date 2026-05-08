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

    __table_args__ = (Index("idx_exam_paper_tenant_status", "tenant_id", "status"),)

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(
        Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    title = Column(String(300), nullable=False)
    file_name = Column(String(300), nullable=True)
    subject = Column(String(50), nullable=True)
    grade = Column(String(20), nullable=True)
    source_year = Column(Integer, nullable=True)
    source_type = Column(String(50), nullable=True)
    source = Column(String(200), nullable=True)
    memo = Column(Text, nullable=True)
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
    creator = relationship("User", foreign_keys=[created_by])
    questions = relationship(
        "QuestionItem",
        back_populates="paper",
        cascade="all, delete-orphan",
    )


class QuestionItem(Base):
    __tablename__ = "question_items"

    __table_args__ = (
        Index("idx_question_item_paper", "paper_id", "question_number"),
        Index("idx_question_item_tenant_review", "tenant_id", "review_status"),
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    paper_id = Column(
        BigInteger, ForeignKey("exam_papers.id", ondelete="CASCADE"), nullable=False
    )
    tenant_id = Column(
        Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    question_number = Column(Integer, nullable=True)
    area = Column(String(20), nullable=True)
    problem_type = Column(String(50), nullable=True)
    concept_tag = Column(String(100), nullable=True)
    difficulty = Column(String(10), nullable=True)
    question_format = Column(String(20), nullable=True)
    is_listening = Column(Boolean, nullable=False, default=False)
    score_point = Column(Integer, nullable=True)
    question_body = Column(Text, nullable=True)
    choices = Column(JSONB, nullable=True)
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
    tenant = relationship("Tenant", back_populates="question_items")
