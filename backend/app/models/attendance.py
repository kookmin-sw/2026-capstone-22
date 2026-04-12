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
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..database import Base


class AttendanceStatus(str, enum.Enum):
    present = "present"
    absent = "absent"
    late = "late"
    early_leave = "early_leave"


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "student_id",
            "attendance_date",
            name="uq_attendance_student_date",
        ),
        Index("idx_att_tenant_date", "tenant_id", "attendance_date"),
        Index("idx_att_tenant_class_date", "tenant_id", "class_id", "attendance_date"),
        Index("idx_att_tenant_status", "tenant_id", "status", "attendance_date"),
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(
        Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    student_id = Column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    class_id = Column(
        Integer,
        ForeignKey("student_classes.id", ondelete="SET NULL"),
        nullable=True,
    )
    attendance_date = Column(Date, nullable=False)
    status = Column(
        SQLAlchemyEnum(AttendanceStatus, name="attendance_status", create_type=False),
        nullable=False,
        server_default="present",
    )
    memo = Column(Text, nullable=True)
    created_by = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    tenant = relationship("Tenant", back_populates="attendance_records")
    student = relationship("Student", back_populates="attendance_records")
    student_class = relationship("StudentClass", back_populates="attendance_records")
    creator = relationship("User", foreign_keys=[created_by])
