from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.tenant import Tenant
from ..schemas.tenant import TenantPublicInfo

router = APIRouter()


@router.get("/{slug}", response_model=TenantPublicInfo)
async def get_tenant_by_slug(slug: str, db: Session = Depends(get_db)):
    """Get public tenant info by slug (for login page branding)"""
    tenant = (
        db.query(Tenant).filter(Tenant.slug == slug, Tenant.status == "active").first()
    )
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant
