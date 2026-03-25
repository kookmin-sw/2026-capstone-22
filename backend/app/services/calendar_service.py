import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from sqlalchemy.orm import Session

from ..config import settings
from ..models.tenant import TenantCalendarConfig

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/userinfo.email",
]


def _get_client_config() -> dict:
    return {
        "web": {
            "client_id": settings.GOOGLE_CALENDAR_CLIENT_ID,
            "client_secret": settings.GOOGLE_CALENDAR_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [settings.GOOGLE_CALENDAR_REDIRECT_URI],
        }
    }


def create_auth_url(tenant_id: int) -> str:
    """Generate Google OAuth 2.0 authorization URL"""
    flow = Flow.from_client_config(
        _get_client_config(),
        scopes=SCOPES,
        redirect_uri=settings.GOOGLE_CALENDAR_REDIRECT_URI,
    )
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        state=str(tenant_id),
    )
    return auth_url


def exchange_code(code: str, db: Session, tenant_id: int) -> TenantCalendarConfig:
    """Exchange authorization code for tokens and save to DB"""
    import os
    os.environ["OAUTHLIB_RELAX_TOKEN_SCOPE"] = "1"

    flow = Flow.from_client_config(
        _get_client_config(),
        scopes=SCOPES,
        redirect_uri=settings.GOOGLE_CALENDAR_REDIRECT_URI,
    )
    flow.fetch_token(code=code)
    creds = flow.credentials

    # Get connected email
    service = build("oauth2", "v2", credentials=creds)
    user_info = service.userinfo().get().execute()
    connected_email = user_info.get("email", "")

    # Save or update config
    config = db.query(TenantCalendarConfig).filter(
        TenantCalendarConfig.tenant_id == tenant_id
    ).first()

    if not config:
        config = TenantCalendarConfig(tenant_id=tenant_id)
        db.add(config)

    config.access_token = creds.token
    config.refresh_token = creds.refresh_token
    config.token_expiry = creds.expiry.replace(tzinfo=timezone.utc) if creds.expiry else None
    config.connected_email = connected_email
    config.calendar_id = "primary"

    db.commit()
    db.refresh(config)
    logger.info(f"Calendar connected for tenant {tenant_id}: {connected_email}")
    return config


def _get_credentials(config: TenantCalendarConfig, db: Session) -> Optional[Credentials]:
    """Build Credentials from DB config, auto-refresh if expired"""
    if not config.access_token:
        return None

    creds = Credentials(
        token=config.access_token,
        refresh_token=config.refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.GOOGLE_CALENDAR_CLIENT_ID,
        client_secret=settings.GOOGLE_CALENDAR_CLIENT_SECRET,
        expiry=config.token_expiry.replace(tzinfo=None) if config.token_expiry else None,
    )

    if creds.expired and creds.refresh_token:
        from google.auth.transport.requests import Request
        creds.refresh(Request())
        # Update tokens in DB
        config.access_token = creds.token
        config.token_expiry = creds.expiry.replace(tzinfo=timezone.utc) if creds.expiry else None
        db.commit()
        logger.info(f"Calendar token refreshed for tenant {config.tenant_id}")

    return creds


def _get_calendar_service(tenant_id: int, db: Session):
    """Get authenticated Google Calendar service for a tenant"""
    config = db.query(TenantCalendarConfig).filter(
        TenantCalendarConfig.tenant_id == tenant_id
    ).first()

    if not config:
        return None, "캘린더가 연동되지 않았습니다."

    creds = _get_credentials(config, db)
    if not creds:
        return None, "캘린더 인증 정보가 없습니다. 다시 연동해주세요."

    service = build("calendar", "v3", credentials=creds)
    return service, config.calendar_id or "primary"


def list_events(
    tenant_id: int,
    db: Session,
    time_min: Optional[str] = None,
    time_max: Optional[str] = None,
    max_results: int = 10,
    query: Optional[str] = None,
) -> Dict[str, Any]:
    """List calendar events"""
    result = _get_calendar_service(tenant_id, db)
    if isinstance(result[0], type(None)) and isinstance(result[1], str):
        return {"error": result[1]}
    service, calendar_id = result

    now = datetime.now(timezone.utc)
    if not time_min:
        time_min = now.isoformat()
    if not time_max:
        time_max = (now + timedelta(days=30)).isoformat()

    try:
        events_result = service.events().list(
            calendarId=calendar_id,
            timeMin=time_min,
            timeMax=time_max,
            maxResults=max_results,
            singleEvents=True,
            orderBy="startTime",
            q=query,
        ).execute()

        events = events_result.get("items", [])
        return {
            "events": [
                {
                    "id": e.get("id"),
                    "summary": e.get("summary", "(제목 없음)"),
                    "description": e.get("description", ""),
                    "location": e.get("location", ""),
                    "start": e.get("start", {}).get("dateTime") or e.get("start", {}).get("date"),
                    "end": e.get("end", {}).get("dateTime") or e.get("end", {}).get("date"),
                    "status": e.get("status"),
                }
                for e in events
            ],
            "count": len(events),
        }
    except Exception as e:
        logger.error(f"Calendar list_events failed: {e}")
        return {"error": str(e)}


def create_event(
    tenant_id: int,
    db: Session,
    summary: str,
    start_time: str,
    end_time: str,
    description: str = "",
    location: str = "",
) -> Dict[str, Any]:
    """Create a calendar event"""
    result = _get_calendar_service(tenant_id, db)
    if isinstance(result[0], type(None)) and isinstance(result[1], str):
        return {"error": result[1]}
    service, calendar_id = result

    # Determine if all-day event (date only, no time component)
    is_all_day = len(start_time) == 10  # "2026-03-15" format

    # Duplicate check: find existing events with same summary and start time
    try:
        if is_all_day:
            check_min = f"{start_time}T00:00:00+09:00"
            check_max = f"{start_time}T23:59:59+09:00"
        else:
            check_min = start_time
            # Check within 1 minute window for timed events
            parsed = datetime.fromisoformat(start_time)
            check_max = (parsed + timedelta(minutes=1)).isoformat()

        existing = service.events().list(
            calendarId=calendar_id,
            timeMin=check_min,
            timeMax=check_max,
            singleEvents=True,
            q=summary,
        ).execute()

        for e in existing.get("items", []):
            if e.get("summary", "").strip() == summary.strip():
                logger.info(f"Duplicate calendar event detected: '{summary}' at {start_time}")
                return {
                    "id": e.get("id"),
                    "summary": e.get("summary"),
                    "start": e.get("start", {}).get("dateTime") or e.get("start", {}).get("date"),
                    "end": e.get("end", {}).get("dateTime") or e.get("end", {}).get("date"),
                    "htmlLink": e.get("htmlLink"),
                    "message": "동일한 일정이 이미 존재합니다.",
                    "duplicate": True,
                }
    except Exception as dup_err:
        logger.warning(f"Duplicate check failed (proceeding with creation): {dup_err}")

    event_body = {
        "summary": summary,
        "description": description,
        "location": location,
    }

    if is_all_day:
        event_body["start"] = {"date": start_time}
        event_body["end"] = {"date": end_time}
    else:
        event_body["start"] = {"dateTime": start_time, "timeZone": "Asia/Seoul"}
        event_body["end"] = {"dateTime": end_time, "timeZone": "Asia/Seoul"}

    try:
        event = service.events().insert(calendarId=calendar_id, body=event_body).execute()
        return {
            "id": event.get("id"),
            "summary": event.get("summary"),
            "start": event.get("start", {}).get("dateTime") or event.get("start", {}).get("date"),
            "end": event.get("end", {}).get("dateTime") or event.get("end", {}).get("date"),
            "htmlLink": event.get("htmlLink"),
            "message": "일정이 생성되었습니다.",
        }
    except Exception as e:
        logger.error(f"Calendar create_event failed: {e}")
        return {"error": str(e)}


def update_event(
    tenant_id: int,
    db: Session,
    event_id: str,
    summary: Optional[str] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    description: Optional[str] = None,
    location: Optional[str] = None,
) -> Dict[str, Any]:
    """Update a calendar event"""
    result = _get_calendar_service(tenant_id, db)
    if isinstance(result[0], type(None)) and isinstance(result[1], str):
        return {"error": result[1]}
    service, calendar_id = result

    try:
        existing = service.events().get(calendarId=calendar_id, eventId=event_id).execute()

        if summary is not None:
            existing["summary"] = summary
        if description is not None:
            existing["description"] = description
        if location is not None:
            existing["location"] = location
        if start_time:
            is_all_day = len(start_time) == 10
            existing["start"] = {"date": start_time} if is_all_day else {"dateTime": start_time, "timeZone": "Asia/Seoul"}
        if end_time:
            is_all_day = len(end_time) == 10
            existing["end"] = {"date": end_time} if is_all_day else {"dateTime": end_time, "timeZone": "Asia/Seoul"}

        updated = service.events().update(
            calendarId=calendar_id, eventId=event_id, body=existing
        ).execute()

        return {
            "id": updated.get("id"),
            "summary": updated.get("summary"),
            "start": updated.get("start", {}).get("dateTime") or updated.get("start", {}).get("date"),
            "end": updated.get("end", {}).get("dateTime") or updated.get("end", {}).get("date"),
            "message": "일정이 수정되었습니다.",
        }
    except Exception as e:
        logger.error(f"Calendar update_event failed: {e}")
        return {"error": str(e)}


def delete_event(
    tenant_id: int,
    db: Session,
    event_id: str,
) -> Dict[str, Any]:
    """Delete a calendar event"""
    result = _get_calendar_service(tenant_id, db)
    if isinstance(result[0], type(None)) and isinstance(result[1], str):
        return {"error": result[1]}
    service, calendar_id = result

    try:
        service.events().delete(calendarId=calendar_id, eventId=event_id).execute()
        return {"message": "일정이 삭제되었습니다.", "deleted_id": event_id}
    except Exception as e:
        logger.error(f"Calendar delete_event failed: {e}")
        return {"error": str(e)}


# === Gemini Function Calling Definitions ===

CALENDAR_FUNCTION_DECLARATIONS = [
    {
        "name": "list_calendar_events",
        "description": "Google 캘린더에서 일정을 조회합니다. 특정 날짜, 기간, 키워드로 검색할 수 있습니다.",
        "parameters": {
            "type": "object",
            "properties": {
                "time_min": {
                    "type": "string",
                    "description": "조회 시작 시간 (ISO 8601 형식, 예: 2026-03-12T00:00:00+09:00). 미지정시 현재 시간부터.",
                },
                "time_max": {
                    "type": "string",
                    "description": "조회 종료 시간 (ISO 8601 형식, 예: 2026-03-19T23:59:59+09:00). 미지정시 30일 후까지.",
                },
                "max_results": {
                    "type": "integer",
                    "description": "최대 반환 개수 (기본 10)",
                },
                "query": {
                    "type": "string",
                    "description": "일정 제목/설명에서 검색할 키워드",
                },
            },
        },
    },
    {
        "name": "create_calendar_event",
        "description": "Google 캘린더에 새 일정을 생성합니다.",
        "parameters": {
            "type": "object",
            "properties": {
                "summary": {
                    "type": "string",
                    "description": "일정 제목 (필수)",
                },
                "start_time": {
                    "type": "string",
                    "description": "시작 시간 (ISO 8601, 예: 2026-03-15T14:00:00+09:00) 또는 종일 이벤트는 날짜만 (2026-03-15)",
                },
                "end_time": {
                    "type": "string",
                    "description": "종료 시간 (ISO 8601, 예: 2026-03-15T15:00:00+09:00) 또는 종일 이벤트는 날짜만 (2026-03-16)",
                },
                "description": {
                    "type": "string",
                    "description": "일정 설명 (선택)",
                },
                "location": {
                    "type": "string",
                    "description": "장소 (선택)",
                },
            },
            "required": ["summary", "start_time", "end_time"],
        },
    },
    {
        "name": "update_calendar_event",
        "description": "기존 캘린더 일정을 수정합니다. 먼저 list_calendar_events로 event_id를 조회하세요.",
        "parameters": {
            "type": "object",
            "properties": {
                "event_id": {
                    "type": "string",
                    "description": "수정할 일정의 ID (필수, list_calendar_events에서 조회)",
                },
                "summary": {
                    "type": "string",
                    "description": "변경할 제목",
                },
                "start_time": {
                    "type": "string",
                    "description": "변경할 시작 시간",
                },
                "end_time": {
                    "type": "string",
                    "description": "변경할 종료 시간",
                },
                "description": {
                    "type": "string",
                    "description": "변경할 설명",
                },
                "location": {
                    "type": "string",
                    "description": "변경할 장소",
                },
            },
            "required": ["event_id"],
        },
    },
    {
        "name": "delete_calendar_event",
        "description": "캘린더 일정을 삭제합니다. 먼저 list_calendar_events로 event_id를 조회하세요.",
        "parameters": {
            "type": "object",
            "properties": {
                "event_id": {
                    "type": "string",
                    "description": "삭제할 일정의 ID (필수)",
                },
            },
            "required": ["event_id"],
        },
    },
]


def execute_calendar_function(
    function_name: str,
    args: dict,
    tenant_id: int,
    db: Session,
) -> dict:
    """Execute a calendar function call from Gemini"""
    if function_name == "list_calendar_events":
        return list_events(
            tenant_id=tenant_id,
            db=db,
            time_min=args.get("time_min"),
            time_max=args.get("time_max"),
            max_results=args.get("max_results", 10),
            query=args.get("query"),
        )
    elif function_name == "create_calendar_event":
        return create_event(
            tenant_id=tenant_id,
            db=db,
            summary=args["summary"],
            start_time=args["start_time"],
            end_time=args["end_time"],
            description=args.get("description", ""),
            location=args.get("location", ""),
        )
    elif function_name == "update_calendar_event":
        return update_event(
            tenant_id=tenant_id,
            db=db,
            event_id=args["event_id"],
            summary=args.get("summary"),
            start_time=args.get("start_time"),
            end_time=args.get("end_time"),
            description=args.get("description"),
            location=args.get("location"),
        )
    elif function_name == "delete_calendar_event":
        return delete_event(
            tenant_id=tenant_id,
            db=db,
            event_id=args["event_id"],
        )
    else:
        return {"error": f"Unknown calendar function: {function_name}"}
