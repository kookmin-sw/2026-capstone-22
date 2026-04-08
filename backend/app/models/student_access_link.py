import enum

from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    Enum as SQLAlchemyEnum,
    ForeignKey,
    Integer,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..database import Base


class RelationshipType(str, enum.Enum):
    self = "self"
    mother = "mother"
    father = "father"
    guardian = "guardian"


class AccessLinkStatus(str, enum.Enum):
    active = "active"
    revoked = "revoked"


class VerifiedBy(str, enum.Enum):
    phone_otp = "phone_otp"
    admin = "admin"


class StudentAccessLink(Base):
    __tablename__ = "student_access_links"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "user_id", "student_id", name="uq_student_access_link"
        ),
    )

    id = Column(BigInteger, primary_key=True, index=True)
    tenant_id = Column(
        Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    student_id = Column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    relationship_type = Column(
        SQLAlchemyEnum(RelationshipType, name="relationship_type_enum"),
        nullable=False,
    )
    status = Column(
        SQLAlchemyEnum(AccessLinkStatus, name="access_link_status_enum"),
        nullable=False,
        default=AccessLinkStatus.active,
    )
    verified_by = Column(
        SQLAlchemyEnum(VerifiedBy, name="verified_by_enum"),
        nullable=False,
    )
    verified_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    tenant = relationship("Tenant", back_populates="student_access_links")
    user = relationship("User", back_populates="student_access_links")
    student = relationship("Student", back_populates="access_links")
