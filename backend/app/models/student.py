import enum

from sqlalchemy import (
    BigInteger,
    Column,
    Date,
    DateTime,
    Enum as SQLAlchemyEnum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..database import Base


class StudentClassStatus(str, enum.Enum):
    active = "active"
    closed = "closed"


class StudentStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"
    graduated = "graduated"


class StudentClass(Base):
    __tablename__ = "student_classes"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)

    name = Column(String(100), nullable=False)
    code = Column(String(50), nullable=True)
    grade_level = Column(String(50), nullable=True)
    subject = Column(String(50), nullable=True)
    teacher_name = Column(String(50), nullable=True)
    day_of_week = Column(String(20), nullable=True)
    start_time = Column(String(10), nullable=True)
    end_time = Column(String(10), nullable=True)
    capacity = Column(Integer, nullable=True)
    status = Column(
        SQLAlchemyEnum(StudentClassStatus, name="student_class_status"),
        default=StudentClassStatus.active,
        nullable=False,
    )
    memo = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_student_class_code_tenant"),
    )

    tenant = relationship("Tenant", back_populates="student_classes")
    students = relationship(
        "Student", back_populates="student_class", passive_deletes=True
    )
    attendance_records = relationship(
        "AttendanceRecord", back_populates="student_class", passive_deletes=True
    )


class Student(Base):
    __tablename__ = "students"

    id = Column(BigInteger, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    class_id = Column(
        Integer,
        ForeignKey("student_classes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    name = Column(String(100), nullable=False)
    birth_date = Column(Date, nullable=False)
    school_name = Column(String(100), nullable=True)
    grade = Column(String(50), nullable=True)
    phone = Column(String(30), nullable=True)
    parent_name = Column(String(50), nullable=True)
    parent_phone = Column(String(30), nullable=True)
    status = Column(
        SQLAlchemyEnum(StudentStatus, name="student_status"),
        default=StudentStatus.active,
        nullable=False,
    )
    memo = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    tenant = relationship("Tenant", back_populates="students")
    student_class = relationship("StudentClass", back_populates="students")
    access_links = relationship(
        "StudentAccessLink", back_populates="student", cascade="all, delete-orphan"
    )
    attendance_records = relationship(
        "AttendanceRecord", back_populates="student", cascade="all, delete-orphan"
    )
