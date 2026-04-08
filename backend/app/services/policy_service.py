from sqlalchemy.orm import Session

from ..config import settings
from ..models.student_access_link import AccessLinkStatus, StudentAccessLink
from ..models.user import User
from ..schemas.verification import (
    AccessDeniedResponse,
    PolicyResult,
    VerificationRequiredResponse,
)
from .verification_service import create_verification_token


def check_personal_access(
    db: Session,
    user: User,
    tenant_id: int,
    tenant_slug: str,
) -> PolicyResult:
    """
    개인정보 질문에 대한 접근 권한을 검사하고 PolicyResult를 반환한다.

    정책 분기:
    1. 슈퍼어드민 임퍼소네이션 (is_superadmin=True AND is_admin=True)
       → tenant 전체 허용 (allowed_student_ids=None)
    2. 웹 테넌트 관리자 (is_superadmin=False AND is_admin=True AND tenant_id 일치)
       → tenant 전체 허용 (allowed_student_ids=None)
    3. 슈퍼어드민 직접 접근 (is_superadmin=True AND is_admin=False)
       → 명시적 거부 (AccessDeniedResponse)
    4. 일반 사용자
       → student_access_links 조회 후 링크 있으면 허용, 없으면 verification_required 반환

    임퍼소네이션 감지 근거 (dependencies.py L51-66):
    - 임퍼소네이션 시 user 객체는 is_superadmin=True, is_admin=True (in-memory 조작)
    - 일반 어드민은 is_superadmin=False, is_admin=True
    """
    # 1. 슈퍼어드민 임퍼소네이션
    if user.is_superadmin and user.is_admin:
        return PolicyResult(allowed=True, allowed_student_ids=None)

    # 2. 웹 테넌트 관리자
    if not user.is_superadmin and user.is_admin and user.tenant_id == tenant_id:
        return PolicyResult(allowed=True, allowed_student_ids=None)

    # 3. 슈퍼어드민 직접 접근 (임퍼소네이션 없음)
    if user.is_superadmin and not user.is_admin:
        return PolicyResult(
            allowed=False,
            denied_response=AccessDeniedResponse(
                message="개인정보 조회는 임퍼소네이션 상태에서만 가능합니다."
            ),
        )

    # 4. 일반 사용자 — tenant 소속 검증 후 student_access_links 조회
    if user.tenant_id != tenant_id:
        return PolicyResult(
            allowed=False,
            denied_response=AccessDeniedResponse(
                message="해당 학원의 서비스에 접근할 권한이 없습니다."
            ),
        )

    links = (
        db.query(StudentAccessLink)
        .filter(
            StudentAccessLink.user_id == user.id,
            StudentAccessLink.tenant_id == tenant_id,
            StudentAccessLink.status == AccessLinkStatus.active,
        )
        .all()
    )

    if links:
        allowed_ids = [link.student_id for link in links]
        return PolicyResult(allowed=True, allowed_student_ids=allowed_ids)

    # 링크 없음 — verification_required 반환
    token = create_verification_token(user.id, tenant_id)
    verification_url = f"{settings.APP_BASE_URL}/{tenant_slug}/verify?token={token}"
    return PolicyResult(
        allowed=False,
        denied_response=VerificationRequiredResponse(
            message="성적, 출결, 과제 정보는 본인 확인 후 조회할 수 있습니다.",
            verification_url=verification_url,
        ),
    )
