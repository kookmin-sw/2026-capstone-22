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


class AssignmentSubmissionStatus(str, enum.Enum):
    assigned = "assigned"
    submitted = "submitted"
    excused = "excused"


class Assignment(Base):
    __tablename__ = "assignments"

    __table_args__ = (
        Index("idx_assign_tenant_due", "tenant_id", "due_date"),
        Index("idx_assign_tenant_class_due", "tenant_id", "class_id", "due_date"),
        Index("idx_assign_tenant_subject_due", "tenant_id", "subject", "due_date"),
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
    subject = Column(String(100), nullable=True)
    assigned_date = Column(Date, nullable=False)
    due_date = Column(Date, nullable=False)
    description = Column(Text, nullable=True)
    memo = Column(Text, nullable=True)
    created_by = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    tenant = relationship("Tenant", back_populates="assignments")
    student_class = relationship("StudentClass", back_populates="assignments")
    creator = relationship("User", foreign_keys=[created_by])
    submissions = relationship(
        "AssignmentSubmission",
        back_populates="assignment",
        cascade="all, delete-orphan",
    )


class AssignmentSubmission(Base):
    __tablename__ = "assignment_submissions"

    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "assignment_id",
            "student_id",
            name="uq_submission_assignment_student",
        ),
        Index("idx_sub_tenant_student_status", "tenant_id", "student_id", "status"),
        Index("idx_sub_tenant_assignment", "tenant_id", "assignment_id"),
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(
        Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    assignment_id = Column(
        BigInteger, ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False
    )
    student_id = Column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    status = Column(
        SQLAlchemyEnum(
            AssignmentSubmissionStatus,
            name="assignment_submission_status",
            create_type=False,
        ),
        nullable=False,
        server_default="assigned",
    )
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    score = Column(Numeric(6, 2), nullable=True)
    feedback = Column(Text, nullable=True)
    memo = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    tenant = relationship("Tenant", back_populates="assignment_submissions")
    assignment = relationship("Assignment", back_populates="submissions")
    student = relationship("Student", back_populates="assignment_submissions")
