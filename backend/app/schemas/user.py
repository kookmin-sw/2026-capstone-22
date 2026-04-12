from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class UserBase(BaseModel):
    email: EmailStr
    username: str


class UserCreate(UserBase):
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    username: Optional[str] = None
    preferred_model: Optional[str] = None
    group_id: Optional[int] = None
    is_admin: Optional[bool] = None


class GroupInfo(BaseModel):
    id: int
    name: str
    description: Optional[str] = None

    class Config:
        from_attributes = True


class UserResponse(UserBase):
    id: int
    is_admin: bool
    is_superadmin: bool = False
    tenant_id: Optional[int] = None
    group_id: Optional[int] = None
    preferred_model: str
    created_at: datetime
    group: Optional[GroupInfo] = None
    has_verified_access: bool = False  # active student_access_links 존재 여부

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefresh(BaseModel):
    refresh_token: str


class ExternalLoginRequest(BaseModel):
    """외부 SSO 토큰으로 로그인 요청"""

    external_token: str  # 외부 시스템에서 받은 JWT 토큰


class AdminPasswordChange(BaseModel):
    """관리자가 유저 비밀번호 변경"""

    new_password: str


class AdminUserUpdate(BaseModel):
    """관리자가 유저 정보 전체 수정"""

    username: Optional[str] = None
    email: Optional[str] = None
    preferred_model: Optional[str] = None
    group_id: Optional[int] = None
    is_admin: Optional[bool] = None


class ExternalTokenPayload(BaseModel):
    """외부 JWT 토큰 페이로드"""

    userid: str
    name: str
    staff_no: Optional[int] = None
    branch_no: Optional[str] = None
    branch: Optional[str] = None
    univ_no: Optional[int] = None
    univ: Optional[str] = None
    hp: Optional[str] = None
    exp: int
