from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base
from datetime import datetime


class StoreGroupPermission(Base):
    __tablename__ = "store_group_permissions"

    id = Column(Integer, primary_key=True, index=True)
    store_name = Column(String, nullable=False, index=True)
    group_id = Column(
        Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False
    )
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    can_read = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    group = relationship("Group", back_populates="store_permissions")
