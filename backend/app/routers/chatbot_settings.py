from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models.chatbot_settings import ChatbotSettings
from ..models.user import User
from ..schemas.chatbot_settings import (
    ChatbotSettingsResponse,
    ChatbotSettingsUpdate,
    PresetResponse,
)
from ..utils.dependencies import get_current_admin_user

router = APIRouter()

# ==================== Presets (static data) ====================

PRESETS: List[dict] = [
    {
        "id": "default",
        "name": "기본",
        "description": "정중한 존댓말로 간결하게 답변하는 기본 스타일",
        "chatbot_name": "",
        "greeting_message": "안녕하세요, 무엇을 도와드릴까요?",
        "tone": "polite",
        "response_style": "concise",
        "sample_response": "해당 내용을 확인하여 안내드리겠습니다. 문서에 따르면...",
    },
    {
        "id": "friendly_helper",
        "name": "친절한 도우미",
        "description": "친근한 말투로 편안하게 대화하는 스타일",
        "chatbot_name": "도우미",
        "greeting_message": "안녕하세요! 무엇이든 편하게 물어보세요 :)",
        "tone": "friendly",
        "response_style": "balanced",
        "sample_response": "아 그 부분이 궁금하셨군요! 관련 내용을 찾아봤어요. 문서를 보니까...",
    },
    {
        "id": "professional",
        "name": "전문 어시스턴트",
        "description": "전문적이고 신뢰감 있는 어투로 상세하게 답변",
        "chatbot_name": "AI 어시스턴트",
        "greeting_message": "안녕하세요, AI 어시스턴트입니다. 문서 기반 질의응답을 도와드리겠습니다.",
        "tone": "professional",
        "response_style": "detailed",
        "sample_response": "해당 질문에 대해 문서를 확인한 결과, 다음과 같은 정보를 안내드립니다. 첫째로...",
    },
    {
        "id": "formal",
        "name": "격식있는 비서",
        "description": "격식체로 공식적이고 정중하게 답변",
        "chatbot_name": "비서",
        "greeting_message": "안녕하십니까. 궁금하신 사항을 말씀해 주십시오.",
        "tone": "formal",
        "response_style": "concise",
        "sample_response": "확인 결과를 아래와 같이 안내드리겠습니다. 관련 문서에 의하면...",
    },
    {
        "id": "casual",
        "name": "캐주얼 친구",
        "description": "편안하고 캐주얼한 말투로 짧게 답변",
        "chatbot_name": "레디",
        "greeting_message": "반가워요! 뭐든 물어보세요~",
        "tone": "friendly",
        "response_style": "concise",
        "sample_response": "오 그거요! 문서 찾아보니까 이렇게 되어있어요~",
    },
]


@router.get("/presets", response_model=List[PresetResponse])
async def get_presets():
    """프리셋 목록 반환"""
    return PRESETS


# ==================== CRUD ====================

@router.get("", response_model=ChatbotSettingsResponse)
async def get_chatbot_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """현재 테넌트의 챗봇 설정 조회"""
    settings = db.query(ChatbotSettings).filter(
        ChatbotSettings.tenant_id == current_user.tenant_id
    ).first()

    if not settings:
        raise HTTPException(status_code=404, detail="Chatbot settings not found")

    return settings


@router.put("", response_model=ChatbotSettingsResponse)
async def upsert_chatbot_settings(
    data: ChatbotSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """챗봇 설정 생성/수정 (upsert)"""
    settings = db.query(ChatbotSettings).filter(
        ChatbotSettings.tenant_id == current_user.tenant_id
    ).first()

    if settings:
        # Update existing
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(settings, key, value)
    else:
        # Create new
        settings = ChatbotSettings(
            tenant_id=current_user.tenant_id,
            **data.model_dump(exclude_unset=True),
        )
        db.add(settings)

    db.commit()
    db.refresh(settings)
    return settings
