from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.hitl_request import HitlRequest, HitlStatus
from ..models.user import User
from ..utils.dependencies import get_current_admin_user

router = APIRouter()


@router.get("")
def list_hitl(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """HITL 목록 조회 (pending 우선, created_at ASC). 복합 인덱스 활용."""
    items = (
        db.query(HitlRequest)
        .filter(HitlRequest.tenant_id == current_user.tenant_id)
        .order_by(HitlRequest.status.asc(), HitlRequest.created_at.asc())
        .all()
    )
    return {
        "items": [
            {
                "id": item.id,
                "user_message": item.user_message,
                "ai_response": item.ai_response,
                "hitl_reason": item.hitl_reason,
                "status": item.status.value,
                "created_at": item.created_at.isoformat() if item.created_at else None,
                "resolved_at": (
                    item.resolved_at.isoformat() if item.resolved_at else None
                ),
                "resolved_by": item.resolved_by,
            }
            for item in items
        ],
        "total": len(items),
    }


@router.patch("/{hitl_id}")
def resolve_hitl(
    hitl_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """HITL 완료 처리. tenant_id 필터로 IDOR 방지."""
    item = (
        db.query(HitlRequest)
        .filter(
            HitlRequest.id == hitl_id,
            HitlRequest.tenant_id == current_user.tenant_id,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    item.status = HitlStatus.resolved
    item.resolved_at = datetime.now(timezone.utc)
    item.resolved_by = current_user.id
    db.commit()

    return {"id": item.id, "status": item.status.value}
