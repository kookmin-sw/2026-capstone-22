import random
import re
import string
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from ..config import settings
from ..models.student import Student
from ..models.student_access_link import (
    AccessLinkStatus,
    RelationshipType,
    StudentAccessLink,
    VerifiedBy,
)
from ..models.verification_challenge import VerificationChallenge

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

_VERIFICATION_TOKEN_TYPE = "verification"


_MIN_PHONE_DIGITS = 9


def normalize_phone(phone: str) -> str:
    """
    다양한 형식의 전화번호를 숫자만 남긴 형태로 정규화한다.
    예: 010-1234-5678 / +82 10-1234-5678 / (010)1234-5678 → "01012345678"
    정규화 결과가 9자리 미만이면 빈 문자열("")을 반환한다.
    """
    if not phone or not phone.strip():
        return ""
    digits = re.sub(r"\D", "", phone)
    # +82 국가코드 처리: 821012345678 → 01012345678
    if digits.startswith("82") and len(digits) >= 11:
        digits = "0" + digits[2:]
    if len(digits) < _MIN_PHONE_DIGITS:
        return ""
    return digits


def create_verification_token(user_id: int, tenant_id: int) -> str:
    """type=verification 전용 JWT 토큰 발급 (10분 TTL)"""
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.VERIFICATION_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": str(user_id),
        "tenant_id": tenant_id,
        "type": _VERIFICATION_TOKEN_TYPE,
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_verification_token(token: str) -> Optional[dict]:
    """
    verification 전용 토큰을 디코딩한다.
    type 필드가 'verification'이 아니면 None을 반환하여 일반 access token 우회를 차단한다.
    """
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        if payload.get("type") != _VERIFICATION_TOKEN_TYPE:
            return None
        return payload
    except JWTError:
        return None


def create_otp(db: Session, user_id: int, tenant_id: int, phone: str) -> str:
    """
    OTP를 생성하고 verification_challenges에 저장한다.
    기존 미사용 challenge가 있으면 used_at을 현재 시각으로 설정해 무효화한 후 새로 발급한다.
    OTP 코드를 평문으로 반환한다 (웹 페이지에서 직접 표시).
    """
    normalized = normalize_phone(phone)
    if not normalized:
        raise ValueError("유효하지 않은 전화번호입니다.")
    now = datetime.now(timezone.utc)

    # 기존 미사용 challenge 무효화
    existing = (
        db.query(VerificationChallenge)
        .filter(
            VerificationChallenge.user_id == user_id,
            VerificationChallenge.tenant_id == tenant_id,
            VerificationChallenge.target_phone == normalized,
            VerificationChallenge.used_at.is_(None),
        )
        .all()
    )
    for challenge in existing:
        challenge.used_at = now

    # 새 OTP 생성
    code = "".join(random.choices(string.digits, k=6))
    code_hash = pwd_context.hash(code)
    expires_at = now + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

    challenge = VerificationChallenge(
        user_id=user_id,
        tenant_id=tenant_id,
        target_phone=normalized,
        code_hash=code_hash,
        expires_at=expires_at,
        attempt_count=0,
        used_at=None,
    )
    db.add(challenge)
    db.commit()

    return code


def verify_otp(
    db: Session, user_id: int, tenant_id: int, phone: str, code: str
) -> bool:
    """
    OTP를 검증한다.
    - 만료 또는 사용된 challenge는 무시한다.
    - 시도마다 attempt_count를 증가시키고 OTP_MAX_ATTEMPTS 초과 시 False를 반환한다.
    - 검증 성공 시 used_at을 기록하고 True를 반환한다.
    """
    normalized = normalize_phone(phone)
    now = datetime.now(timezone.utc)

    challenge = (
        db.query(VerificationChallenge)
        .filter(
            VerificationChallenge.user_id == user_id,
            VerificationChallenge.tenant_id == tenant_id,
            VerificationChallenge.target_phone == normalized,
            VerificationChallenge.used_at.is_(None),
            VerificationChallenge.expires_at > now,
        )
        .order_by(VerificationChallenge.created_at.desc())
        .first()
    )

    if not challenge:
        return False

    challenge.attempt_count += 1

    if challenge.attempt_count > settings.OTP_MAX_ATTEMPTS:
        db.commit()
        return False

    if not pwd_context.verify(code, challenge.code_hash):
        db.commit()
        return False

    challenge.used_at = now
    db.commit()
    return True


def match_and_link_students(
    db: Session, user_id: int, tenant_id: int, phone: str
) -> list[StudentAccessLink]:
    """
    전화번호로 매칭되는 학생을 찾아 student_access_links를 upsert한다.
    - parent_phone은 DB 저장 포맷이 일정하지 않으므로 Python에서 normalize_phone 후 비교한다.
    - 매칭 학생이 0명이면 ValueError를 발생시킨다.
    - relationship_type은 'guardian' 고정, verified_by는 'phone_otp'로 기록한다.
    """
    normalized_input = normalize_phone(phone)
    if not normalized_input:
        raise ValueError("유효하지 않은 전화번호입니다.")
    now = datetime.now(timezone.utc)

    # tenant 소속 전체 학생 조회 후 Python에서 전화번호 비교
    all_students = (
        db.query(Student)
        .filter(Student.tenant_id == tenant_id, Student.parent_phone.isnot(None))
        .all()
    )
    matched = [
        s
        for s in all_students
        if normalize_phone(s.parent_phone or "") == normalized_input
        and normalize_phone(s.parent_phone or "") != ""
    ]

    if not matched:
        raise ValueError("입력하신 전화번호로 등록된 학생을 찾을 수 없습니다.")

    links = []
    for student in matched:
        existing_link = (
            db.query(StudentAccessLink)
            .filter(
                StudentAccessLink.tenant_id == tenant_id,
                StudentAccessLink.user_id == user_id,
                StudentAccessLink.student_id == student.id,
            )
            .first()
        )

        if existing_link:
            existing_link.status = AccessLinkStatus.active
            existing_link.verified_by = VerifiedBy.phone_otp
            existing_link.verified_at = now
            links.append(existing_link)
        else:
            link = StudentAccessLink(
                tenant_id=tenant_id,
                user_id=user_id,
                student_id=student.id,
                relationship_type=RelationshipType.guardian,
                status=AccessLinkStatus.active,
                verified_by=VerifiedBy.phone_otp,
                verified_at=now,
            )
            db.add(link)
            links.append(link)

    db.commit()
    for link in links:
        db.refresh(link)

    return links
