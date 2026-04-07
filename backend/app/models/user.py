from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    is_superadmin = Column(Boolean, default=False, nullable=False)
    tenant_id = Column(
        Integer, ForeignKey("tenants.id"), nullable=True, index=True
    )  # NULL for superadmin
    group_id = Column(
        Integer, ForeignKey("groups.id", ondelete="SET NULL"), nullable=True
    )
    preferred_model = Column(String, default="gemini-2.5-flash", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # 외부 SSO 연동 필드
    external_user_id = Column(String(100), unique=True, nullable=True, index=True)
    staff_no = Column(Integer, nullable=True)
    external_branch = Column(String(100), nullable=True)
    external_univ = Column(String(100), nullable=True)
    phone = Column(String(20), nullable=True)
    auth_provider = Column(String(20), default="local")

    # Relationships
    tenant = relationship("Tenant", back_populates="users")
    group = relationship("Group", back_populates="users")
    chat_sessions = relationship(
        "ChatSession", back_populates="user", cascade="all, delete-orphan"
    )
    corpora = relationship("Corpus", back_populates="creator")
    student_access_links = relationship(
        "StudentAccessLink", back_populates="user", cascade="all, delete-orphan"
    )
    verification_challenges = relationship(
        "VerificationChallenge", back_populates="user", cascade="all, delete-orphan"
    )
