from typing import Literal, Optional, Union
from pydantic import BaseModel


class VerificationRequiredResponse(BaseModel):
    type: Literal["verification_required"] = "verification_required"
    message: str
    verification_url: str


class AccessDeniedResponse(BaseModel):
    type: Literal["access_denied"] = "access_denied"
    message: str


class OtpRequestSchema(BaseModel):
    token: str
    phone: str


class OtpVerifySchema(BaseModel):
    token: str
    phone: str
    code: str


class OtpRequestResponse(BaseModel):
    success: bool
    otp_code: str


class VerificationSuccessResponse(BaseModel):
    success: bool
    linked_students: list[str]


class DebugTokenResponse(BaseModel):
    token: str


class PolicyResult(BaseModel):
    allowed: bool
    # None = tenant 전체 허용 (관리자/임퍼소네이션)
    # list = 허용된 학생 ID 목록 (일반 사용자, 항상 1개 이상)
    allowed_student_ids: Optional[list[int]] = None
    denied_response: Optional[
        Union[VerificationRequiredResponse, AccessDeniedResponse]
    ] = None
