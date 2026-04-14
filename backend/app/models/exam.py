import enum

from sqlalchemy import (
    BigInteger,
    Column,
    Date,
    DateTime,
    Enum as SQLAlchemyEnum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..database import Base


class ExamResultStatus(str, enum.Enum):
    pending = "pending"
    completed = "completed"
    absent = "absent"
    excused = "excused"


class Exam(Base):
    __tablename__ = "exams"

    __table_args__ = (
        Index("idx_exam_tenant_date", "tenant_id", "exam_date"),
        Index("idx_exam_tenant_class_date", "tenant_id", "class_id", "exam_date"),
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(
        Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    class_id = Column(
        Integer,
        ForeignKey("student_classes.id", ondelete="SET NULL"),
        nullable=True,
    )
    title = Column(String(200), nullable=False)
    exam_date = Column(Date, nullable=False)
    max_score = Column(Numeric(6, 2), nullable=False, server_default="100")
    exam_type = Column(String(50), nullable=True)
    memo = Column(Text, nullable=True)
    created_by = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    tenant = relationship("Tenant", back_populates="exams")
    student_class = relationship("StudentClass", back_populates="exams")
    creator = relationship("User", foreign_keys=[created_by])
    results = relationship(
        "ExamResult",
        back_populates="exam",
        cascade="all, delete-orphan",
    )


class ExamResult(Base):
    __tablename__ = "exam_results"

    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "exam_id",
            "student_id",
            name="uq_exam_result_exam_student",
        ),
        Index(
            "idx_exam_result_tenant_student_status", "tenant_id", "student_id", "status"
        ),
        Index("idx_exam_result_tenant_exam", "tenant_id", "exam_id"),
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(
        Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    exam_id = Column(
        BigInteger, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False
    )
    student_id = Column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    status = Column(
        SQLAlchemyEnum(
            ExamResultStatus,
            name="exam_result_status",
            create_type=False,
        ),
        nullable=False,
        server_default="pending",
    )
    score = Column(Numeric(6, 2), nullable=True)
    grade = Column(String(20), nullable=True)
    comment = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    tenant = relationship("Tenant", back_populates="exam_results")
    exam = relationship("Exam", back_populates="results")
    student = relationship("Student", back_populates="exam_results")
