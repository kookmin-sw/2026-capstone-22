from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import asyncio
import json
import logging
import os
import re
import shutil
import uuid
from functools import partial

logger = logging.getLogger(__name__)
from ..database import get_db
from ..models.user import User
from ..models.chat import ChatSession, Message, MessageRole
from ..models.prompt_template import PromptTemplate
from ..schemas.chat import (
    ChatSessionCreate,
    ChatSessionResponse,
    ChatSessionListResponse,
    ChatRequest,
    ChatResponse,
    MessageResponse,
    TemplateMessageRequest,
    FeedbackRequest,
    FeedbackResponse,
)
from ..utils.dependencies import (
    get_current_user,
    get_optional_current_user,
    get_or_create_guest_user,
)
from ..services.chat_service import ChatService as GeminiService
from ..utils.chat_history import get_conversation_history, should_use_caching
from ..config import settings

router = APIRouter()


def _get_default_model(db: Session) -> str:
    """Get DEFAULT_MODEL from platform_settings DB, fallback to config."""
    try:
        from ..models.platform_setting import PlatformSetting

        row = (
            db.query(PlatformSetting)
            .filter(PlatformSetting.key == "DEFAULT_MODEL")
            .first()
        )
        if row and row.value:
            return row.value
    except Exception:
        pass
    return settings.DEFAULT_MODEL


@router.post(
    "/sessions", response_model=ChatSessionResponse, status_code=status.HTTP_201_CREATED
)
async def create_session(
    session_data: ChatSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new chat session"""
    model = session_data.model or current_user.preferred_model or _get_default_model(db)

    new_session = ChatSession(
        user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        title=session_data.title or "New Chat",
        model_used=model,
    )

    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    return new_session


@router.get("/sessions", response_model=List[ChatSessionListResponse])
async def list_sessions(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """List all chat sessions for current user (filtered by tenant)"""
    query = db.query(ChatSession).filter(ChatSession.user_id == current_user.id)
    if current_user.tenant_id is not None:
        query = query.filter(ChatSession.tenant_id == current_user.tenant_id)
    sessions = query.order_by(ChatSession.updated_at.desc()).all()

    result = []
    for session in sessions:
        message_count = (
            db.query(Message).filter(Message.session_id == session.id).count()
        )
        result.append({**session.__dict__, "message_count": message_count})

    return result


@router.get("/sessions/{session_id}", response_model=ChatSessionResponse)
async def get_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get chat session with messages"""
    query = db.query(ChatSession).filter(
        ChatSession.id == session_id, ChatSession.user_id == current_user.id
    )
    if current_user.tenant_id is not None:
        query = query.filter(ChatSession.tenant_id == current_user.tenant_id)
    session = query.first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return session


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a chat session"""
    query = db.query(ChatSession).filter(
        ChatSession.id == session_id, ChatSession.user_id == current_user.id
    )
    if current_user.tenant_id is not None:
        query = query.filter(ChatSession.tenant_id == current_user.tenant_id)
    session = query.first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    db.delete(session)
    db.commit()


@router.post("/message", response_model=ChatResponse)
async def send_message(
    message: str = Form(...),
    session_id: Optional[int] = Form(None),
    model: Optional[str] = Form(None),
    web_search_enabled: bool = Form(False),
    files: List[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """Send a message with optional file attachments and get AI response"""
    # 비로그인 사용자는 guest 유저로 처리
    is_guest = current_user is None
    if is_guest:
        current_user = get_or_create_guest_user(db)

    # Guest 유저는 파일 업로드 불가
    if is_guest and files:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="File upload requires authentication",
        )

    # Get or create session
    if session_id:
        session = (
            db.query(ChatSession)
            .filter(
                ChatSession.id == session_id, ChatSession.user_id == current_user.id
            )
            .first()
        )

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
    else:
        # Create new session
        model_to_use = model or current_user.preferred_model or _get_default_model(db)
        session = ChatSession(
            user_id=current_user.id,
            tenant_id=current_user.tenant_id,
            title="New Chat",
            model_used=model_to_use,
        )
        db.add(session)
        db.commit()
        db.refresh(session)

    # Save user message
    user_message = Message(
        session_id=session.id,
        tenant_id=current_user.tenant_id,
        role=MessageRole.USER,
        content=message,
    )
    db.add(user_message)
    db.commit()
    db.refresh(user_message)

    # Get file search stores that the user has access to (DB-based isolation)
    from ..utils.store_access import get_accessible_stores

    try:
        accessible_stores = get_accessible_stores(current_user, db)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error fetching accessible stores: {str(e)}"
        )

    # Load conversation history for this session (excluding current message)
    conversation_history = get_conversation_history(
        session_id=session.id, db=db, max_messages=20, max_tokens=8000
    )

    # Handle file uploads if any
    file_uris = []
    temp_file_paths = []

    if files:
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

        for file in files:
            # Generate safe filename
            file_extension = os.path.splitext(file.filename)[1] if file.filename else ""
            safe_filename = f"{uuid.uuid4()}{file_extension}"
            file_path = os.path.join(settings.UPLOAD_DIR, safe_filename)

            try:
                # Save file temporarily
                with open(file_path, "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)

                temp_file_paths.append(file_path)

                # Upload to Gemini
                uploaded_file = GeminiService.upload_file_for_chat(
                    file_path=file_path,
                    display_name=file.filename,
                    mime_type=file.content_type or "application/octet-stream",
                )

                file_uris.append(uploaded_file["uri"])

            except Exception as e:
                # Clean up temp files on error
                for temp_path in temp_file_paths:
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
                raise HTTPException(
                    status_code=500, detail=f"Error uploading file to Gemini: {str(e)}"
                )

    # Check if tenant has calendar connected & get tenant name & chatbot settings
    has_calendar = False
    tenant_name = "ReadyTalk"
    chatbot_settings = None
    if current_user.tenant_id:
        from ..models.tenant import TenantCalendarConfig, Tenant
        from ..models.chatbot_settings import ChatbotSettings

        _tenant = db.query(Tenant).filter(Tenant.id == current_user.tenant_id).first()
        if _tenant:
            tenant_name = _tenant.name
        cal_config = (
            db.query(TenantCalendarConfig)
            .filter(
                TenantCalendarConfig.tenant_id == current_user.tenant_id,
                TenantCalendarConfig.refresh_token.isnot(None),
            )
            .first()
        )
        has_calendar = cal_config is not None
        chatbot_settings = (
            db.query(ChatbotSettings)
            .filter(ChatbotSettings.tenant_id == current_user.tenant_id)
            .first()
        )

    # Query Gemini with conversation history
    cited_sources = []
    user_group_name = current_user.group.name if current_user.group else None
    try:
        model_name = model or session.model_used or _get_default_model(db)

        loop = asyncio.get_event_loop()
        if file_uris:
            # Chat with uploaded files
            ai_response = await loop.run_in_executor(
                None,
                partial(
                    GeminiService.chat_with_files,
                    file_uris=file_uris,
                    query=message,
                    model_name=model_name,
                    corpus_names=accessible_stores,
                    web_search_enabled=web_search_enabled,
                    db_session=db,
                    history=conversation_history,
                    user_group_name=user_group_name,
                    tenant_id=current_user.tenant_id,
                    user_id=current_user.id,
                    session_id=session.id,
                    tenant_name=tenant_name,
                    chatbot_settings=chatbot_settings,
                ),
            )
            # chat_with_files returns string for now
            response_text = ai_response
        else:
            # Unified smart query: LLM decides which functions to call
            smart_result = await loop.run_in_executor(
                None,
                partial(
                    GeminiService.query_smart,
                    corpus_names=accessible_stores,
                    query=message,
                    tenant_id=current_user.tenant_id,
                    db_session=db,
                    model_name=model_name,
                    history=conversation_history,
                    user_group_name=user_group_name,
                    web_search_enabled=web_search_enabled,
                    has_calendar=has_calendar,
                    tenant_name=tenant_name,
                    tenant_slug=_tenant.slug if _tenant else "",
                    user_id=current_user.id,
                    session_id=session.id,
                    chatbot_settings=chatbot_settings,
                ),
            )
            response_text = smart_result.get("text", "답변을 생성할 수 없습니다.")
            cited_sources = smart_result.get("cited_sources", [])
            verification_required = smart_result.get("verification_required", False)
            verification_url = smart_result.get("verification_url", None)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error from Gemini: {str(e)}")
    finally:
        # Clean up temporary files
        for temp_path in temp_file_paths:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    # HITL 태그 파싱: 사용자에게 보내기 전에 제거 + hitl_requests 저장
    hitl_match = re.search(r"<HITL>(.*?)</HITL>", response_text, re.DOTALL)
    if hitl_match:
        from ..models.hitl_request import HitlRequest, HitlStatus

        hitl_reason = hitl_match.group(1).strip()
        response_text = re.sub(
            r"<HITL>.*?</HITL>", "", response_text, flags=re.DOTALL
        ).strip()
        db.add(
            HitlRequest(
                tenant_id=current_user.tenant_id,
                session_id=session.id,
                user_message=message,
                ai_response=response_text,
                hitl_reason=hitl_reason,
                status=HitlStatus.pending,
            )
        )
        db.commit()
        logger.info(
            f"HITL saved from web chat: reason='{hitl_reason}' tenant={current_user.tenant_id}"
        )

    # Convert cited_sources to JSON-serializable format for DB storage
    cited_sources_for_db = None
    if cited_sources:
        cited_sources_for_db = [
            {"uri": src.get("uri"), "title": src.get("title")} for src in cited_sources
        ]

    # Save assistant message with cited_sources if available
    assistant_message = Message(
        session_id=session.id,
        tenant_id=current_user.tenant_id,
        role=MessageRole.ASSISTANT,
        content=response_text,
        cited_sources_json=cited_sources_for_db,
    )
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)

    # Update session title if first message
    if db.query(Message).filter(Message.session_id == session.id).count() == 2:
        # First exchange, use first 50 chars of user message as title
        session.title = message[:50] + ("..." if len(message) > 50 else "")
        db.commit()

    return {
        "session_id": session.id,
        "user_message": user_message,
        "assistant_message": assistant_message,
        "cited_sources": cited_sources,
    }


@router.post("/message-stream")
async def send_message_stream(
    message: str = Form(...),
    session_id: Optional[int] = Form(None),
    model: Optional[str] = Form(None),
    web_search_enabled: bool = Form(False),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """Send a message and get AI response as a stream (SSE)"""
    if current_user is None:
        current_user = get_or_create_guest_user(db)

    # Get or create session
    if session_id:
        session = db.query(ChatSession).filter(ChatSession.id == session_id, ChatSession.user_id == current_user.id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
    else:
        model_to_use = model or current_user.preferred_model or _get_default_model(db)
        session = ChatSession(user_id=current_user.id, tenant_id=current_user.tenant_id, title="New Chat", model_used=model_to_use)
        db.add(session)
        db.commit()
        db.refresh(session)

    # Save user message
    user_message = Message(session_id=session.id, tenant_id=current_user.tenant_id, role=MessageRole.USER, content=message)
    db.add(user_message)
    db.commit()

    # Load history
    conversation_history = get_conversation_history(session_id=session.id, db=db, max_messages=20)

    # Tenant info
    tenant_name = "ReadyTalk"
    has_calendar = False
    chatbot_settings = None
    if current_user.tenant_id:
        from ..models.tenant import Tenant, TenantCalendarConfig
        from ..models.chatbot_settings import ChatbotSettings
        _tenant = db.query(Tenant).filter(Tenant.id == current_user.tenant_id).first()
        if _tenant: tenant_name = _tenant.name
        cal_config = db.query(TenantCalendarConfig).filter(TenantCalendarConfig.tenant_id == current_user.tenant_id, TenantCalendarConfig.refresh_token.isnot(None)).first()
        has_calendar = cal_config is not None
        chatbot_settings = db.query(ChatbotSettings).filter(ChatbotSettings.tenant_id == current_user.tenant_id).first()

    from ..utils.store_access import get_accessible_stores
    accessible_stores = get_accessible_stores(current_user, db)
    user_group_name = current_user.group.name if current_user.group else None
    model_name = model or session.model_used or _get_default_model(db)

    async def stream_generator():
        full_text = ""
        final_cited_sources = []
        
        # We need to run the sync generator in a thread pool
        loop = asyncio.get_event_loop()
        gen = GeminiService.query_smart_stream(
            corpus_names=accessible_stores,
            query=message,
            tenant_id=current_user.tenant_id,
            db_session=db,
            model_name=model_name,
            history=conversation_history,
            user_group_name=user_group_name,
            web_search_enabled=web_search_enabled,
            has_calendar=has_calendar,
            tenant_name=tenant_name,
            user_id=current_user.id,
            session_id=session.id,
            chatbot_settings=chatbot_settings
        )

        try:
            while True:
                chunk = await loop.run_in_executor(None, next, gen, None)
                if chunk is None: break
                
                text = chunk.get("text", "")
                full_text += text
                if chunk.get("cited_sources"):
                    final_cited_sources = chunk["cited_sources"]
                
                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
        except StopIteration:
            pass
        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

        # Finalize: Save AI message and update session
        new_db = next(get_db()) # Get fresh DB session for the background save
        try:
            # Parse HITL if present in full text
            hitl_match = re.search(r"<HITL>(.*?)</HITL>", full_text, re.DOTALL)
            final_text = full_text
            if hitl_match:
                from ..models.hitl_request import HitlRequest, HitlStatus
                hitl_reason = hitl_match.group(1).strip()
                final_text = re.sub(r"<HITL>.*?</HITL>", "", full_text, flags=re.DOTALL).strip()
                new_db.add(HitlRequest(tenant_id=current_user.tenant_id, session_id=session.id, user_message=message, ai_response=final_text, hitl_reason=hitl_reason, status=HitlStatus.pending))

            cited_sources_json = [{"uri": s.get("uri"), "title": s.get("title")} for s in final_cited_sources] if final_cited_sources else None
            assistant_message = Message(session_id=session.id, tenant_id=current_user.tenant_id, role=MessageRole.ASSISTANT, content=final_text, cited_sources_json=cited_sources_json)
            new_db.add(assistant_message)
            
            # Update title if first exchange
            msg_count = new_db.query(Message).filter(Message.session_id == session.id).count()
            if msg_count <= 2:
                session_obj = new_db.query(ChatSession).filter(ChatSession.id == session.id).first()
                if session_obj: session_obj.title = message[:50] + ("..." if len(message) > 50 else "")
            
            new_db.commit()
        except Exception as e:
            logger.error(f"Error saving stream results: {e}")
            new_db.rollback()
        finally:
            new_db.close()

    return StreamingResponse(stream_generator(), media_type="text/event-stream")


@router.post("/template-message", response_model=ChatResponse)
async def send_template_message(
    request: TemplateMessageRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """템플릿 ID를 받아서 해당 프롬프트를 바로 채팅 메시지로 전송

    기존 웹 프론트엔드 통합용 - 버튼 클릭 시 한 번의 API 호출로 처리
    """
    # 비로그인 사용자는 guest 유저로 처리
    if current_user is None:
        current_user = get_or_create_guest_user(db)

    # 1. 템플릿 조회
    template = (
        db.query(PromptTemplate)
        .filter(
            PromptTemplate.id == request.template_id, PromptTemplate.is_active == True
        )
        .first()
    )

    if not template:
        raise HTTPException(status_code=404, detail="Template not found or inactive")

    message = template.content

    # 2. 세션 가져오기 또는 생성
    if request.session_id:
        session = (
            db.query(ChatSession)
            .filter(
                ChatSession.id == request.session_id,
                ChatSession.user_id == current_user.id,
            )
            .first()
        )

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
    else:
        # 새 세션 생성
        model_to_use = (
            request.model or current_user.preferred_model or _get_default_model(db)
        )
        session = ChatSession(
            user_id=current_user.id,
            tenant_id=current_user.tenant_id,
            title=template.title,
            model_used=model_to_use,
        )
        db.add(session)
        db.commit()
        db.refresh(session)

    # 3. 사용자 메시지 저장
    user_message = Message(
        session_id=session.id,
        tenant_id=current_user.tenant_id,
        role=MessageRole.USER,
        content=message,
    )
    db.add(user_message)
    db.commit()
    db.refresh(user_message)

    # 4. 접근 가능한 저장소 조회 (DB-based isolation)
    from ..utils.store_access import get_accessible_stores

    try:
        accessible_stores = get_accessible_stores(current_user, db)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error fetching accessible stores: {str(e)}"
        )

    # 5-1. 대화 기록 로드
    conversation_history = get_conversation_history(
        session_id=session.id, db=db, max_messages=20, max_tokens=8000
    )

    # 5-2. Check if tenant has calendar connected & get tenant name & chatbot settings
    has_calendar = False
    tenant_name = "ReadyTalk"
    chatbot_settings = None
    if current_user.tenant_id:
        from ..models.tenant import TenantCalendarConfig, Tenant
        from ..models.chatbot_settings import ChatbotSettings

        _tenant = db.query(Tenant).filter(Tenant.id == current_user.tenant_id).first()
        if _tenant:
            tenant_name = _tenant.name
        cal_config = (
            db.query(TenantCalendarConfig)
            .filter(
                TenantCalendarConfig.tenant_id == current_user.tenant_id,
                TenantCalendarConfig.refresh_token.isnot(None),
            )
            .first()
        )
        has_calendar = cal_config is not None
        chatbot_settings = (
            db.query(ChatbotSettings)
            .filter(ChatbotSettings.tenant_id == current_user.tenant_id)
            .first()
        )

    # 6. Gemini 쿼리
    cited_sources = []
    user_group_name = current_user.group.name if current_user.group else None
    try:
        model_name = request.model or session.model_used or _get_default_model(db)

        smart_result = GeminiService.query_smart(
            corpus_names=accessible_stores,
            query=message,
            tenant_id=current_user.tenant_id,
            db_session=db,
            model_name=model_name,
            history=conversation_history,
            user_group_name=user_group_name,
            web_search_enabled=request.web_search_enabled,
            has_calendar=has_calendar,
            tenant_name=tenant_name,
            user_id=current_user.id,
            session_id=session.id,
            chatbot_settings=chatbot_settings,
        )
        response_text = smart_result.get("text", "답변을 생성할 수 없습니다.")
        cited_sources = smart_result.get("cited_sources", [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error from Gemini: {str(e)}")

    # 7. cited_sources를 DB 저장 가능한 형태로 변환
    cited_sources_for_db = None
    if cited_sources:
        cited_sources_for_db = [
            {"uri": src.get("uri"), "title": src.get("title")} for src in cited_sources
        ]

    # 8. AI 응답 저장
    assistant_message = Message(
        session_id=session.id,
        tenant_id=current_user.tenant_id,
        role=MessageRole.ASSISTANT,
        content=response_text,
        realtime_file_list_json=None,
        cited_sources_json=cited_sources_for_db,
    )
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)

    return {
        "session_id": session.id,
        "user_message": user_message,
        "assistant_message": assistant_message,
        "cited_sources": cited_sources,
    }


@router.post("/feedback", response_model=FeedbackResponse)
async def send_feedback(
    request: FeedbackRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """Send user feedback about an AI response via email"""
    import asyncio
    from ..utils.email import send_feedback_email

    if (
        not settings.SMTP_USER
        or not settings.SMTP_PASSWORD
        or not settings.FEEDBACK_EMAIL
    ):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="피드백 이메일 설정이 되어 있지 않습니다. 관리자에게 문의하세요.",
        )

    # Look up the target message
    target_message = db.query(Message).filter(Message.id == request.message_id).first()
    if not target_message:
        raise HTTPException(status_code=404, detail="Message not found")

    # Build conversation history if user consented
    conversation_history = None
    if request.include_conversation:
        session_id = request.session_id or target_message.session_id
        all_messages = (
            db.query(Message)
            .filter(Message.session_id == session_id)
            .order_by(Message.timestamp.asc())
            .all()
        )
        conversation_history = [
            {"role": msg.role.value, "content": msg.content} for msg in all_messages
        ]

    user_email = current_user.email if current_user else None

    # Send email in a thread pool to avoid blocking
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(
            None,
            send_feedback_email,
            request.feedback_text,
            target_message.content,
            conversation_history,
            user_email,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"이메일 전송 실패: {str(e)}",
        )

    return FeedbackResponse(
        success=True, message="피드백이 전송되었습니다. 감사합니다!"
    )
