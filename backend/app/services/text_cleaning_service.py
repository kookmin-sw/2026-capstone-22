"""추출된 PDF 텍스트를 정제한다."""

import logging
import re

logger = logging.getLogger(__name__)

# 숫자만으로 이루어진 페이지 번호 패턴 (예: "1", "- 1 -", "— 1 —")
_PAGE_NUMBER_PATTERN = re.compile(r"^[\-\—\–\s]*\d{1,3}[\-\—\–\s]*$")


def clean_text(full_text: str) -> dict[str, str]:
    """추출된 텍스트를 정제한다.

    처리 내용:
    - 페이지 번호 줄 제거
    - 반복되는 header/footer 줄 제거
    - 연속 빈 줄 정리
    - 양 끝 공백 제거

    Returns:
        {"cleaned_text": str}
    """
    lines = full_text.splitlines()

    # 반복 등장 횟수를 세어 header/footer 후보 파악 (3회 이상이면 제거)
    line_count: dict[str, int] = {}
    for line in lines:
        stripped = line.strip()
        if stripped:
            line_count[stripped] = line_count.get(stripped, 0) + 1

    repeated_lines: set[str] = {line for line, cnt in line_count.items() if cnt >= 3}
    if repeated_lines:
        logger.debug("반복 줄 %d개 제거 예정: %s", len(repeated_lines), list(repeated_lines)[:5])

    cleaned_lines: list[str] = []
    prev_blank = False

    for line in lines:
        stripped = line.strip()

        # 페이지 번호 줄 제거
        if _PAGE_NUMBER_PATTERN.match(stripped):
            continue

        # 반복 header/footer 제거
        if stripped in repeated_lines:
            continue

        # 연속 빈 줄 하나로 압축
        if not stripped:
            if not prev_blank:
                cleaned_lines.append("")
            prev_blank = True
            continue

        prev_blank = False
        cleaned_lines.append(stripped)

    cleaned_text = "\n".join(cleaned_lines).strip()
    logger.debug("정제 전 %d자 → 정제 후 %d자", len(full_text), len(cleaned_text))

    return {"cleaned_text": cleaned_text}
