"""문제지 미리보기 HTML 저장소 — 파일 기반 (gunicorn 멀티 워커 공유 가능)

/tmp/readytalk_previews/ 디렉토리에 저장하므로 같은 컨테이너 내 모든 워커가 접근 가능.
"""

import uuid
from pathlib import Path

_PREVIEW_DIR = Path("/tmp/readytalk_previews")
_PREVIEW_DIR.mkdir(exist_ok=True)


def store_preview(html: str) -> str:
    """HTML을 파일로 저장하고 UUID 토큰을 반환한다."""
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
