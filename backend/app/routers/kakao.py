import asyncio
import logging
import re
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc
import httpx
from ..database import get_db, SessionLocal
from ..models.tenant import Tenant, TenantKakaoConfig
from ..models.user import User
from ..models.chat import ChatSession, Message, MessageRole
from ..services.chat_service import ChatService as GeminiService
from ..utils.chat_history import get_conversation_history
from ..config import settings

logger = logging.getLogger(__name__)


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


router = APIRouter()

KAKAO_MAX_LENGTH = 1000
KAKAO_TEXTCARD_MAX_LENGTH = 400  # textCard description limit is shorter


def _get_or_create_kakao_user(db: Session, kakao_user_id: str, tenant_id: int) -> User:
    """Find or create a user for a KakaoTalk user"""
    from ..models.group import Group

    email = f"kakao_{kakao_user_id[:16]}@kakao.internal"

    user = (
        db.query(User)
        .filter(
            User.email == email,
            User.tenant_id == tenant_id,
        )
        .first()
    )

    if not user:
        # Find or create "일반" group for this tenant
        default_group = (
            db.query(Group)
            .filter(
                Group.name == "일반",
                Group.tenant_id == tenant_id,
            )
            .first()
        )
        if not default_group:
            default_group = Group(
                name="일반",
                description="카카오 챗봇 기본 그룹",
                tenant_id=tenant_id,
            )
            db.add(default_group)
            db.flush()
            logger.info(f"Created default group '일반' for tenant {tenant_id}")

        user = User(
            email=email,
            username=f"카카오유저_{kakao_user_id[:8]}",
            password_hash="",
            is_admin=False,
            tenant_id=tenant_id,
            auth_provider="kakao",
            group_id=default_group.id,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info(
            f"Created KakaoTalk user: {email} for tenant {tenant_id} (group: 일반)"
        )

    return user


def _get_or_create_session(db: Session, user: User, tenant_id: int) -> ChatSession:
    """Get the persistent kakao session or create one. One session per user, always reused."""
    session = (
        db.query(ChatSession)
        .filter(
            ChatSession.user_id == user.id,
            ChatSession.tenant_id == tenant_id,
        )
        .order_by(desc(ChatSession.updated_at))
        .first()
    )

    if session:
        return session

    new_session = ChatSession(
        user_id=user.id,
        tenant_id=tenant_id,
        title="카카오톡 대화",
        model_used="gemini-2.5-flash",
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    logger.info(f"Created new KakaoTalk session {new_session.id} for user {user.id}")
    return new_session


def _save_messages(
    db: Session,
    session_id: int,
    tenant_id: int,
    user_message: str,
    assistant_message: str,
):
    """Save assistant message to the session (user message is saved before history load)"""
    assistant_msg = Message(
        session_id=session_id,
        tenant_id=tenant_id,
        role=MessageRole.ASSISTANT,
        content=assistant_message,
    )
    db.add(assistant_msg)

    # Touch session updated_at
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if session:
        session.updated_at = datetime.now(timezone.utc)

    db.commit()


def _extract_citations(text: str) -> list:
    """Extract cited filenames from [cite: "filename.pdf"] markers in text."""
    matches = re.findall(r'\[cite:\s*"([^"]+)"\]', text)
    # Deduplicate while preserving order
    seen = set()
    unique = []
    for m in matches:
        if m not in seen:
            seen.add(m)
            unique.append(m)
    return unique


# CTA 키 → Kakao textCard 버튼 매핑
_CTA_CARD_MAP = {
    "레벨테스트예약": {
        "title": "레벨테스트 예약",
        "description": "아래 버튼을 눌러 레벨테스트를 예약하세요.",
        "label": "레벨테스트 예약하기",
        "webLinkUrl": "https://workspace.google.com/intl/ko/products/forms/",
    },
}


def _parse_cta_tags(text: str) -> tuple:
    """AI 응답에서 <CTA> 태그를 추출하고 태그를 제거한 텍스트를 반환."""
    cta_keys = re.findall(r"<CTA>(.*?)</CTA>", text, re.DOTALL)
    clean_text = re.sub(r"<CTA>.*?</CTA>", "", text, flags=re.DOTALL).strip()
    return clean_text, cta_keys


def _build_cta_outputs(cta_keys: list) -> list:
    """CTA 키 리스트를 Kakao textCard output 배열로 변환."""
    cta_outputs = []
    for key in cta_keys:
        card = _CTA_CARD_MAP.get(key)
        if card:
            cta_outputs.append(
                {
                    "textCard": {
                        "title": card["title"],
                        "description": card["description"],
                        "buttons": [
                            {
                                "action": "webLink",
                                "label": card["label"],
                                "webLinkUrl": card["webLinkUrl"],
                            }
                        ],
                    }
                }
            )
    return cta_outputs


def _resolve_source_links(db: Session, filenames: list) -> list:
    """Look up cited filenames in DB and generate GCS signed URLs."""
    from ..models.corpus import Document
    from ..services import gcs_service

    sources = []
    if not gcs_service.is_configured():
        logger.info("GCS not configured, skipping source link generation")
        return sources

    for fname in filenames[:3]:  # max 3 for Kakao buttons
        doc = db.query(Document).filter(Document.display_name == fname).first()
        if doc and doc.gcs_path:
            signed_url = gcs_service.generate_signed_url(
                doc.gcs_path, expiration_minutes=60
            )
            if signed_url:
                sources.append({"title": fname, "uri": signed_url})
                logger.info(f"KakaoTalk source link: {fname}")
    return sources


def _strip_markdown(text: str) -> str:
    """Convert markdown to clean plain text for KakaoTalk"""
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"__(.+?)__", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    text = re.sub(r"_(.+?)_", r"\1", text)
    text = re.sub(r"~~(.+?)~~", r"\1", text)
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1 (\2)", text)
    text = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"(\1)", text)
    text = re.sub(r"^[\s]*[-*]\s+", "• ", text, flags=re.MULTILINE)
    text = re.sub(r"^(\s*\d+)\.\s+", r"\1) ", text, flags=re.MULTILINE)
    text = re.sub(r"```\w*\n?", "", text)
    text = re.sub(r"`(.+?)`", r"\1", text)
    text = re.sub(r"^[-*_]{3,}\s*$", "", text, flags=re.MULTILINE)
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Remove [cite: "..."] markers (sources shown as buttons instead)
    text = re.sub(r'\s*\[cite:\s*"[^"]*"\]', "", text)
    return text.strip()


def _build_kakao_outputs(text_chunks: list, sources: list = None) -> list:
    """Build Kakao outputs list — multiple simpleText for long answers + textCard for sources.
    Kakao allows max 3 outputs per response and callback URL can only be used once."""

    # Determine how many slots sources need
    has_sources = bool(sources and any(s.get("uri") for s in sources[:3]))
    max_text_outputs = 2 if has_sources else 3

    # Build simpleText outputs (up to max_text_outputs)
    outputs = []
    for chunk in text_chunks[:max_text_outputs]:
        outputs.append({"simpleText": {"text": chunk}})

    if not has_sources:
        return outputs

    # Build source buttons
    buttons = []
    for src in sources[:3]:
        uri = src.get("uri")
        if not uri:
            continue
        buttons.append(
            {
                "action": "webLink",
                "label": "📄 원본 문서 보기",
                "webLinkUrl": uri,
            }
        )

    if buttons:
        outputs.append(
            {
                "textCard": {
                    "title": "📚 참고 문서",
                    "description": "답변에 참고된 원본 문서입니다.",
                    "buttons": buttons,
                }
            }
        )

    return outputs


def _split_text(text: str, max_length: int = KAKAO_MAX_LENGTH) -> list:
    """Split text into chunks that fit KakaoTalk's message limit."""
    if len(text) <= max_length:
        return [text]

    chunks = []
    remaining = text

    while remaining:
        if len(remaining) <= max_length:
            chunks.append(remaining)
            break

        split_pos = remaining.rfind("\n\n", 0, max_length)
        if split_pos > max_length * 0.3:
            chunks.append(remaining[:split_pos].rstrip())
            remaining = remaining[split_pos:].lstrip("\n")
            continue

        split_pos = remaining.rfind("\n", 0, max_length)
        if split_pos > max_length * 0.3:
            chunks.append(remaining[:split_pos].rstrip())
            remaining = remaining[split_pos:].lstrip("\n")
            continue

        split_pos = max(
            remaining.rfind(". ", 0, max_length),
            remaining.rfind("! ", 0, max_length),
            remaining.rfind("? ", 0, max_length),
        )
        if split_pos > max_length * 0.3:
            chunks.append(remaining[: split_pos + 1].rstrip())
            remaining = remaining[split_pos + 1 :].lstrip()
            continue

        chunks.append(remaining[:max_length])
        remaining = remaining[max_length:]

    return chunks


async def _process_kakao_callback(
    callback_url: str,
    corpus_names: list,
    utterance: str,
    user_id: int,
    session_id: int,
    tenant_id: int,
    history: list,
    has_calendar: bool = False,
    tenant_name: str = "ReadyTalk",
):
    """Background: complete Gemini query and POST to KakaoTalk callback URL"""
    db = SessionLocal()
    try:
        # Re-load chatbot_settings in this DB session (avoids detached instance error)
        from ..models.chatbot_settings import ChatbotSettings

        cb_settings = (
            db.query(ChatbotSettings)
            .filter(ChatbotSettings.tenant_id == tenant_id)
            .first()
        )

        loop = asyncio.get_event_loop()

        smart_result = await loop.run_in_executor(
            None,
            lambda: GeminiService.query_smart(
                corpus_names=corpus_names,
                query=utterance,
                tenant_id=tenant_id,
                db_session=db,
                model_name=_get_default_model(db),
                history=history,
                has_calendar=has_calendar,
                tenant_name=tenant_name,
                chatbot_settings=cb_settings,
            ),
        )
        raw_text = smart_result.get("text", "답변을 생성할 수 없습니다.")
        used_calendar = smart_result.get("used_calendar", False)
        cited_sources = smart_result.get("cited_sources", [])

        # Filter to sources that have valid URIs from grounding_metadata
        valid_sources = [s for s in cited_sources if s.get("uri")]

        # Fallback: parse [cite: "..."] from text and resolve via DB
        if not valid_sources and not used_calendar:
            cited_filenames = _extract_citations(raw_text)
            if cited_filenames:
                valid_sources = _resolve_source_links(db, cited_filenames)

        if valid_sources:
            logger.info(f"KakaoTalk sources: {[s['title'] for s in valid_sources[:3]]}")

        if not raw_text:
            raw_text = "요청하신 작업을 처리했습니다."
        clean_text, cta_keys = _parse_cta_tags(raw_text)
        response_text = _strip_markdown(clean_text)
        chunks = _split_text(response_text)

        # Save messages to DB (raw_text with tags preserved)
        _save_messages(db, session_id, tenant_id, utterance, raw_text)

        outputs = _build_kakao_outputs(chunks, valid_sources)

        # Append calendar link card only when calendar functions were actually called
        if used_calendar and len(outputs) < 3:
            _tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
            if _tenant:
                from ..config import settings

                base_url = settings.REACT_APP_API_URL.rstrip("/")
                calendar_url = f"{base_url}/{_tenant.slug}/calendar"
                outputs.append(
                    {
                        "textCard": {
                            "title": "캘린더",
                            "description": "캘린더에서 전체 일정을 확인하세요.",
                            "buttons": [
                                {
                                    "action": "webLink",
                                    "label": "일정 보기",
                                    "webLinkUrl": calendar_url,
                                }
                            ],
                        }
                    }
                )

        # Append CTA card(s) if space remains (Kakao max 3 outputs)
        for cta_output in _build_cta_outputs(cta_keys):
            if len(outputs) < 3:
                outputs.append(cta_output)

        callback_body = {
            "version": "2.0",
            "template": {"outputs": outputs},
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(callback_url, json=callback_body)
            if resp.status_code != 200:
                logger.warning(
                    f"Kakao callback returned {resp.status_code}: {resp.text}"
                )

    except Exception as e:
        logger.error(f"KakaoTalk callback failed: {e}", exc_info=True)
    finally:
        db.close()


@router.post("/chat")
async def kakao_chat(request: Request, db: Session = Depends(get_db)):
    """카카오 오픈빌더 스킬 엔드포인트 (단일 엔드포인트, bot_id로 테넌트 라우팅)"""
    try:
        body = await request.json()
    except Exception:
        return _kakao_error_response("요청을 처리할 수 없습니다.")

    # 1. Extract bot_id, user info, message, and callback URL
    user_request = body.get("userRequest", {})
    bot = body.get("bot", {})
    bot_id = bot.get("id")
    channel = user_request.get("channel", {})
    channel_id = channel.get("id")
    utterance = user_request.get("utterance", "").strip()
    callback_url = user_request.get("callbackUrl")

    # Extract kakao user ID
    kakao_user = user_request.get("user", {})
    kakao_user_id = kakao_user.get("id", "")

    identifier = bot_id or channel_id
    if not identifier:
        logger.warning("KakaoTalk request missing both bot_id and channel_id")
        return _kakao_error_response("채널 정보가 없습니다.")

    if not utterance:
        return _kakao_simple_response("질문을 입력해 주세요.")

    # 1-1. Check for /clear command (reset conversation history)
    if utterance.strip().lower() in {"/clear", "/초기화", "초기화"}:
        # Find tenant and user, then delete session messages
        _kc = None
        if bot_id:
            _kc = (
                db.query(TenantKakaoConfig)
                .filter(TenantKakaoConfig.bot_id == bot_id)
                .first()
            )
        if not _kc and channel_id:
            _kc = (
                db.query(TenantKakaoConfig)
                .filter(TenantKakaoConfig.channel_id == channel_id)
                .first()
            )
        if _kc and kakao_user_id:
            _user = _get_or_create_kakao_user(db, kakao_user_id, _kc.tenant_id)
            if _user:
                # Delete all sessions and messages for this user
                sessions = (
                    db.query(ChatSession)
                    .filter(
                        ChatSession.user_id == _user.id,
                        ChatSession.tenant_id == _kc.tenant_id,
                    )
                    .all()
                )
                for s in sessions:
                    db.query(Message).filter(Message.session_id == s.id).delete()
                    db.delete(s)
                db.commit()
                logger.info(
                    f"Cleared conversation history for kakao user {kakao_user_id} in tenant {_kc.tenant_id}"
                )
        return _kakao_simple_response(
            "대화 내역이 초기화되었습니다. 새롭게 대화를 시작해 주세요!"
        )

    # 1-2. Check for admin/document keyword commands
    ADMIN_KEYWORDS = {"관리자", "어드민", "admin", "대시보드", "dashboard"}
    DOC_KEYWORDS = {
        "문서 업로드",
        "문서업로드",
        "문서 관리",
        "문서관리",
        "파일 업로드",
        "파일업로드",
    }
    stripped = utterance.strip()
    if stripped in ADMIN_KEYWORDS or stripped in DOC_KEYWORDS:
        _kc = None
        if bot_id:
            _kc = (
                db.query(TenantKakaoConfig)
                .filter(TenantKakaoConfig.bot_id == bot_id)
                .first()
            )
        if not _kc and channel_id:
            _kc = (
                db.query(TenantKakaoConfig)
                .filter(TenantKakaoConfig.channel_id == channel_id)
                .first()
            )
        if _kc:
            _tenant = db.query(Tenant).filter(Tenant.id == _kc.tenant_id).first()
            if _tenant:
                from ..config import settings

                base_url = settings.REACT_APP_API_URL.rstrip("/")
                if stripped in DOC_KEYWORDS:
                    target_url = f"{base_url}/{_tenant.slug}/admin/stores"
                    title = "문서 관리"
                    description = "문서 업로드, 문서저장소 관리는\n관리자 페이지에서 가능합니다.\n\n관리자 계정으로 로그인이 필요합니다."
                    label = "문서 관리 페이지 열기"
                else:
                    target_url = f"{base_url}/{_tenant.slug}/admin"
                    title = "관리자 대시보드"
                    description = "사용자 관리, 문서 관리, 설정 등은\n관리자 페이지에서 가능합니다.\n\n관리자 계정으로 로그인이 필요합니다."
                    label = "관리자 페이지 열기"
                return {
                    "version": "2.0",
                    "template": {
                        "outputs": [
                            {
                                "basicCard": {
                                    "thumbnail": {
                                        "imageUrl": "https://i.imgur.com/PfrPHIX.png",
                                    },
                                    "title": title,
                                    "description": description,
                                    "buttons": [
                                        {
                                            "action": "webLink",
                                            "label": label,
                                            "webLinkUrl": target_url,
                                        }
                                    ],
                                }
                            }
                        ]
                    },
                }
        return _kakao_simple_response(
            "관리자 페이지를 찾을 수 없습니다. 관리자에게 문의해 주세요."
        )

    # 1-3. Check for counselor/agent keyword commands
    COUNSELOR_KEYWORDS = {
        "상담원",
        "상담원 연결",
        "상담사 연결",
        "상담 연결",
        "상담원연결",
        "담당자 연결",
        "담당자연결",
    }
    if utterance.strip() in COUNSELOR_KEYWORDS:
        return {
            "version": "2.0",
            "template": {
                "outputs": [
                    {
                        "textCard": {
                            "title": "상담원 연결",
                            "description": "아래 버튼을 누르면 상담원과 1:1 채팅이 시작됩니다.\n\n상담이 끝나면 채팅 하단의 [End] 버튼을 눌러주세요.\nEnd를 누르지 않으면 챗봇으로 돌아오지 않습니다.",
                            "buttons": [
                                {
                                    "action": "operator",
                                    "label": "상담원 연결하기",
                                }
                            ],
                        }
                    }
                ]
            },
        }

    # 2. Find tenant by bot_id first, then channel_id
    kakao_config = None
    if bot_id:
        kakao_config = (
            db.query(TenantKakaoConfig)
            .filter(TenantKakaoConfig.bot_id == bot_id)
            .first()
        )
    if not kakao_config and channel_id:
        kakao_config = (
            db.query(TenantKakaoConfig)
            .filter(TenantKakaoConfig.channel_id == channel_id)
            .first()
        )

    if not kakao_config:
        logger.warning(f"Unknown KakaoTalk bot_id: {bot_id}, channel_id: {channel_id}")
        return _kakao_error_response("등록되지 않은 채널입니다.")

    tenant_id = kakao_config.tenant_id
    _tenant_obj = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    tenant_name = _tenant_obj.name if _tenant_obj else "ReadyTalk"

    from ..models.chatbot_settings import ChatbotSettings

    chatbot_settings = (
        db.query(ChatbotSettings).filter(ChatbotSettings.tenant_id == tenant_id).first()
    )

    # 3. Get or create kakao user & session
    user = (
        _get_or_create_kakao_user(db, kakao_user_id, tenant_id)
        if kakao_user_id
        else None
    )
    session = _get_or_create_session(db, user, tenant_id) if user else None

    # Save user message first so it's included in history (matches web chat behavior)
    if session:
        user_msg = Message(
            session_id=session.id,
            tenant_id=tenant_id,
            role=MessageRole.USER,
            content=utterance,
        )
        db.add(user_msg)
        db.commit()

    history = get_conversation_history(session.id, db) if session else None

    # 4. Get accessible corpus names (group-based access control)
    from ..utils.store_access import get_accessible_stores

    corpus_names = get_accessible_stores(user, db) if user else []
    if not corpus_names:
        # Fallback: if user has no group or no permissions, show message
        return _kakao_simple_response(
            "접근 가능한 문서가 없습니다. 관리자에게 문의해 주세요."
        )

    # 4-1. Check if tenant has calendar connected
    from ..models.tenant import TenantCalendarConfig

    has_calendar = (
        db.query(TenantCalendarConfig)
        .filter(
            TenantCalendarConfig.tenant_id == tenant_id,
            TenantCalendarConfig.refresh_token.isnot(None),
        )
        .first()
        is not None
    )

    # 5. Use callback for async response
    if callback_url:
        asyncio.create_task(
            _process_kakao_callback(
                callback_url=callback_url,
                corpus_names=corpus_names,
                utterance=utterance,
                user_id=user.id if user else 0,
                session_id=session.id if session else 0,
                tenant_id=tenant_id,
                history=history or [],
                has_calendar=has_calendar,
                tenant_name=tenant_name,
            )
        )
        return {"version": "2.0", "useCallback": True}

    # Fallback: no callback URL, query directly
    try:
        loop = asyncio.get_event_loop()

        smart_result = await loop.run_in_executor(
            None,
            lambda: GeminiService.query_smart(
                corpus_names=corpus_names,
                query=utterance,
                tenant_id=tenant_id,
                db_session=db,
                model_name=_get_default_model(db),
                history=history or [],
                has_calendar=has_calendar,
                tenant_name=tenant_name,
                chatbot_settings=chatbot_settings,
            ),
        )
        raw_text = smart_result.get("text", "답변을 생성할 수 없습니다.")
        used_calendar = smart_result.get("used_calendar", False)
        cited_sources = smart_result.get("cited_sources", [])
        valid_sources = [s for s in cited_sources if s.get("uri")]

        # Fallback: parse [cite: "..."] from text and resolve via DB
        if not valid_sources and not used_calendar:
            cited_filenames = _extract_citations(raw_text)
            if cited_filenames:
                valid_sources = _resolve_source_links(db, cited_filenames)

        if not raw_text:
            raw_text = "요청하신 작업을 처리했습니다."
        clean_text, cta_keys = _parse_cta_tags(raw_text)
        response_text = _strip_markdown(clean_text)
        chunks = _split_text(response_text)

        if session:
            _save_messages(db, session.id, tenant_id, utterance, raw_text)

        outputs = _build_kakao_outputs(chunks, valid_sources)

        # Append calendar link card only when calendar functions were actually called
        if used_calendar and len(outputs) < 3:
            _tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
            if _tenant:
                from ..config import settings

                base_url = settings.REACT_APP_API_URL.rstrip("/")
                calendar_url = f"{base_url}/{_tenant.slug}/calendar"
                outputs.append(
                    {
                        "textCard": {
                            "title": "캘린더",
                            "description": "캘린더에서 전체 일정을 확인하세요.",
                            "buttons": [
                                {
                                    "action": "webLink",
                                    "label": "일정 보기",
                                    "webLinkUrl": calendar_url,
                                }
                            ],
                        }
                    }
                )

        # Append CTA card(s) if space remains (Kakao max 3 outputs)
        for cta_output in _build_cta_outputs(cta_keys):
            if len(outputs) < 3:
                outputs.append(cta_output)

        return {
            "version": "2.0",
            "template": {"outputs": outputs},
        }

    except Exception as e:
        logger.error(f"KakaoTalk query failed for tenant {tenant_id}: {e}")
        return _kakao_error_response(
            "답변을 생성하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
        )


def _kakao_simple_response(text: str) -> dict:
    """카카오 오픈빌더 simpleText 응답 포맷"""
    return {"version": "2.0", "template": {"outputs": [{"simpleText": {"text": text}}]}}


def _kakao_error_response(text: str) -> dict:
    """카카오 오픈빌더 에러 응답"""
    return _kakao_simple_response(text)
