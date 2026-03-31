from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from ..database import Base
from datetime import datetime


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    description = Column(String, nullable=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("name", "tenant_id", name="uq_group_name_tenant"),
    )

    # Relationships
    tenant = relationship("Tenant", back_populates="groups")
    users = relationship("User", back_populates="group")
    store_permissions = relationship(
        "StoreGroupPermission", back_populates="group", cascade="all, delete-orphan"
    )
