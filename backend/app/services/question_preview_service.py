"""문제지 미리보기 HTML 저장소 — 파일 기반 (gunicorn 멀티 워커 공유 가능)

/app/uploads/previews/ 에 저장 → docker-compose의 ./uploads:/app/uploads
영구 볼륨이므로 컨테이너 재시작 후에도 링크가 유효하다.
(구 경로 /tmp/readytalk_previews/ 는 컨테이너 재시작 시 초기화되어 404가 발생했음)
"""

import os
import time
import uuid
from pathlib import Path

# 영구 볼륨 경로 사용. 환경변수 UPLOAD_DIR로 재정의 가능(로컬 개발용).
_UPLOAD_BASE = Path(os.environ.get("UPLOAD_DIR", "/app/uploads"))
_PREVIEW_DIR = _UPLOAD_BASE / "previews"
_PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

_TTL_SECONDS = 2 * 60 * 60  # 2시간


def _cleanup_expired() -> None:
    """TTL이 지난 미리보기 파일을 삭제한다. 새 파일 저장 시 호출."""
    cutoff = time.time() - _TTL_SECONDS
    for f in _PREVIEW_DIR.glob("*.html"):
        try:
            if f.stat().st_mtime < cutoff:
                f.unlink(missing_ok=True)
        except Exception:
            pass


def store_preview(html: str) -> str:
    """HTML을 파일로 저장하고 UUID 토큰을 반환한다."""
    _cleanup_expired()
    token = str(uuid.uuid4())
    (_PREVIEW_DIR / f"{token}.html").write_text(html, encoding="utf-8")
    return token


def get_preview(token: str) -> str | None:
    """토큰에 해당하는 HTML 파일을 읽어 반환한다. 없으면 None."""
    # UUID 형식 검증 — 경로 탐색(path traversal) 방지
    if not all(c in "0123456789abcdefABCDEF-" for c in token):
        return None
    file_path = _PREVIEW_DIR / f"{token}.html"
    if not file_path.exists():
        return None
    return file_path.read_text(encoding="utf-8")
