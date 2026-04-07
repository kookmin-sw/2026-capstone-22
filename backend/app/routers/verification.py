import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.tenant import Tenant
from ..schemas.verification import (
    DebugTokenResponse,
    OtpRequestResponse,
    OtpRequestSchema,
    OtpVerifySchema,
    VerificationSuccessResponse,
)
from ..services import verification_service
from ..utils.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_tenant_or_404(slug: str, db: Session) -> Tenant:
    tenant = db.query(Tenant).filter(Tenant.slug == slug).first()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="존재하지 않는 학원입니다.",
        )
    return tenant


@router.get(
    "/verify/{tenant_slug}/debug-token",
    response_model=DebugTokenResponse,
    summary="[디버그 전용] verification token 발급",
)
async def debug_get_verification_token(
    tenant_slug: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    1차 테스트용 verification token 발급 엔드포인트.
    자신의 tenant 또는 임퍼소네이션 슈퍼어드민만 발급 가능하다.
    향후 kakao.py/chat.py 통합 후 제거 예정.
    """
    tenant = _get_tenant_or_404(tenant_slug, db)

    is_impersonating_superadmin = current_user.is_superadmin and current_user.is_admin
    if not is_impersonating_superadmin and current_user.tenant_id != tenant.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="해당 학원의 인증 토큰을 발급할 권한이 없습니다.",
        )

    token = verification_service.create_verification_token(current_user.id, tenant.id)
    return DebugTokenResponse(token=token)


@router.post(
    "/verify/{tenant_slug}/request",
    response_model=OtpRequestResponse,
    summary="OTP 요청",
)
async def request_otp(
    tenant_slug: str,
    body: OtpRequestSchema,
    db: Session = Depends(get_db),
):
    """
    verification token과 전화번호를 받아 OTP를 생성하고 코드를 응답에 직접 반환한다.
    토큰 만료/변조 → 403, 잘못된 전화번호 → 400
    """
    payload = verification_service.decode_verification_token(body.token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="유효하지 않거나 만료된 인증 토큰입니다.",
        )

    user_id = int(payload["sub"])
    token_tenant_id = int(payload["tenant_id"])

    tenant = _get_tenant_or_404(tenant_slug, db)
    if tenant.id != token_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="토큰의 학원 정보가 일치하지 않습니다.",
        )

    try:
        otp_code = verification_service.create_otp(db, user_id, tenant.id, body.phone)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return OtpRequestResponse(success=True, otp_code=otp_code)


@router.post(
    "/verify/{tenant_slug}/confirm",
    response_model=VerificationSuccessResponse,
    summary="OTP 확인 및 학생 링크 생성",
)
async def confirm_otp(
    tenant_slug: str,
    body: OtpVerifySchema,
    db: Session = Depends(get_db),
):
    """
    OTP를 검증하고 매칭 학생에 대해 student_access_links를 생성한다.
    토큰 만료/변조 → 403, OTP 오류/학생 없음 → 400
    """
    payload = verification_service.decode_verification_token(body.token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="유효하지 않거나 만료된 인증 토큰입니다.",
        )

    user_id = int(payload["sub"])
    token_tenant_id = int(payload["tenant_id"])

    tenant = _get_tenant_or_404(tenant_slug, db)
    if tenant.id != token_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="토큰의 학원 정보가 일치하지 않습니다.",
        )

    verified = verification_service.verify_otp(
        db, user_id, tenant.id, body.phone, body.code
    )
    if not verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP가 올바르지 않거나 만료되었습니다.",
        )

    try:
        links = verification_service.match_and_link_students(
            db, user_id, tenant.id, body.phone
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    linked_student_names = [link.student.name for link in links]
    return VerificationSuccessResponse(
        success=True, linked_students=linked_student_names
    )
