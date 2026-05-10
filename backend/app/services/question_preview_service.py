"""임시 문제지 미리보기 HTML 저장소 (in-memory, TTL 2시간)"""

import uuid
from datetime import datetime, timedelta

_store: dict[str, tuple[str, datetime]] = {}


def store_preview(html: str, expires_minutes: int = 120) -> str:
    """HTML을 저장하고 UUID 토큰을 반환한다."""
    token = str(uuid.uuid4())
    expiry = datetime.utcnow() + timedelta(minutes=expires_minutes)
    _store[token] = (html, expiry)
    _purge_expired()
    return token


def get_preview(token: str) -> str | None:
    """토큰에 해당하는 HTML을 반환한다. 만료되었거나 없으면 None."""
    entry = _store.get(token)
    if not entry:
        return None
    html, expiry = entry
    if datetime.utcnow() > expiry:
        _store.pop(token, None)
        return None
    return html


def _purge_expired() -> None:
    """만료된 항목을 정리한다."""
    now = datetime.utcnow()
    expired = [k for k, (_, exp) in _store.items() if now > exp]
    for k in expired:
        _store.pop(k, None)
