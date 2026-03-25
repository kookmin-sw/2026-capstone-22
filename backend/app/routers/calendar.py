import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.user import User
from ..models.tenant import Tenant, TenantCalendarConfig
from ..utils.dependencies import get_current_user, get_current_admin_user
from ..services import calendar_service
from ..config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


# ==================== OAuth Flow ====================

@router.get("/auth")
async def calendar_auth(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Start Google Calendar OAuth flow (admin only)"""
    if not settings.GOOGLE_CALENDAR_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google Calendar OAuth가 설정되지 않았습니다.")

    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="테넌트에 소속되지 않은 사용자입니다.")

    auth_url = calendar_service.create_auth_url(current_user.tenant_id)
    return {"auth_url": auth_url}


@router.get("/callback")
async def calendar_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: Session = Depends(get_db),
):
    """Google OAuth callback - exchanges code for tokens"""
    try:
        tenant_id = int(state)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid state parameter")

    # Get tenant slug for redirect
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    tenant_slug = tenant.slug if tenant else ""
    frontend_url = settings.REACT_APP_API_URL or "http://localhost:8888"

    try:
        config = calendar_service.exchange_code(code, db, tenant_id)
        return RedirectResponse(
            url=f"{frontend_url}/{tenant_slug}/admin?calendar=connected&email={config.connected_email}"
        )
    except Exception as e:
        logger.error(f"Calendar OAuth callback failed: {e}", exc_info=True)
        return RedirectResponse(
            url=f"{frontend_url}/{tenant_slug}/admin?calendar=error"
        )


# ==================== Calendar Status ====================

@router.get("/status")
async def calendar_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check if calendar is connected for current tenant"""
    if not current_user.tenant_id:
        return {"connected": False}

    config = db.query(TenantCalendarConfig).filter(
        TenantCalendarConfig.tenant_id == current_user.tenant_id
    ).first()

    if not config or not config.refresh_token:
        return {"connected": False}

    return {
        "connected": True,
        "email": config.connected_email,
        "calendar_id": config.calendar_id,
    }


@router.delete("/disconnect")
async def calendar_disconnect(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Disconnect Google Calendar (admin only)"""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="테넌트에 소속되지 않은 사용자입니다.")

    config = db.query(TenantCalendarConfig).filter(
        TenantCalendarConfig.tenant_id == current_user.tenant_id
    ).first()

    if config:
        db.delete(config)
        db.commit()
        logger.info(f"Calendar disconnected for tenant {current_user.tenant_id}")

    return {"message": "캘린더 연동이 해제되었습니다."}


# ==================== Calendar CRUD (REST API) ====================

@router.get("/events")
async def get_events(
    time_min: str = Query(None),
    time_max: str = Query(None),
    max_results: int = Query(10),
    q: str = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List calendar events"""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="테넌트에 소속되지 않은 사용자입니다.")

    result = calendar_service.list_events(
        tenant_id=current_user.tenant_id,
        db=db,
        time_min=time_min,
        time_max=time_max,
        max_results=max_results,
        query=q,
    )

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return result


# ==================== Public Calendar API (no auth) ====================

@router.get("/public/{slug}/status")
async def public_calendar_status(
    slug: str,
    db: Session = Depends(get_db),
):
    """Check if calendar is connected for a tenant (public, no auth required)"""
    tenant = db.query(Tenant).filter(Tenant.slug == slug).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="테넌트를 찾을 수 없습니다.")

    config = db.query(TenantCalendarConfig).filter(
        TenantCalendarConfig.tenant_id == tenant.id
    ).first()

    if not config or not config.refresh_token:
        return {"connected": False}

    return {
        "connected": True,
        "email": config.connected_email,
        "calendar_id": config.calendar_id,
    }


@router.get("/public/{slug}/events")
async def public_get_events(
    slug: str,
    time_min: str = Query(None),
    time_max: str = Query(None),
    max_results: int = Query(10),
    q: str = Query(None),
    db: Session = Depends(get_db),
):
    """List calendar events (public, no auth required)"""
    tenant = db.query(Tenant).filter(Tenant.slug == slug).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="테넌트를 찾을 수 없습니다.")

    result = calendar_service.list_events(
        tenant_id=tenant.id,
        db=db,
        time_min=time_min,
        time_max=time_max,
        max_results=max_results,
        query=q,
    )

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return result


@router.post("/events")
async def create_event(
    event_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a calendar event"""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="테넌트에 소속되지 않은 사용자입니다.")

    result = calendar_service.create_event(
        tenant_id=current_user.tenant_id,
        db=db,
        summary=event_data.get("summary", ""),
        start_time=event_data.get("start_time", ""),
        end_time=event_data.get("end_time", ""),
        description=event_data.get("description", ""),
        location=event_data.get("location", ""),
    )

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return result
