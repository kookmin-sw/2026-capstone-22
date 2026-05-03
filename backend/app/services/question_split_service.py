"""정제된 텍스트를 문항 후보 블록으로 분리한다."""

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# 문항 시작 패턴 (선택지 기호 ①②③④⑤ 는 제외)
_QUESTION_START = re.compile(
    r"(?:"
    r"^\d{1,2}\."       # 1. 또는 23.
    r"|^\d{1,2}\)"      # 1) 또는 23)
    r"|^문제\s*\d+"     # 문제1, 문제 1
    r"|^제\s*\d+\s*문"  # 제1문, 제 1 문
    r")"
)

# 공통 지문 범위 패턴 [43～45] (～, ~, - 대응)
_RANGE_PATTERN = re.compile(r"^\s*\[(\d{1,2})\s*[～~-]\s*(\d{1,2})\]")

# 너무 짧은 블록 기준 (공백 제외 글자 수)
_MIN_BLOCK_CHARS = 20


def split_questions(cleaned_text: str) -> list[dict[str, Any]]:
    """정제된 텍스트를 문항 후보 블록 리스트로 분리한다.

    Returns:
        [
            {
                "question_number": int,
                "block_text": str,
                "confidence": float,
                "status": "candidate" | "need_review",
            },
            ...
        ]
    """
    lines = cleaned_text.splitlines()

    # (인덱스, 타입, 값) 수집
    # 타입: 'single', 'range'
    markers: list[dict[str, Any]] = []
    for i, line in enumerate(lines):
        stripped = line.strip()

        # 공통 지문 범위 먼저 확인
        range_match = _RANGE_PATTERN.search(stripped)
        if range_match:
            start_num = int(range_match.group(1))
            end_num = int(range_match.group(2))
            markers.append({"index": i, "type": "range", "value": (start_num, end_num)})
            continue

        # 개별 문항 시작 확인
        if _QUESTION_START.match(stripped):
            num = _extract_question_number(stripped)
            markers.append({"index": i, "type": "single", "value": num})

    if not markers:
        logger.warning("문항 시작 패턴을 찾지 못했습니다. 전체 텍스트를 단일 블록으로 반환합니다.")
        return [_make_block(0, cleaned_text)]

    # 마커 사이의 텍스트 블록 생성
    raw_blocks: list[dict[str, Any]] = []
    for idx, marker in enumerate(markers):
        start = marker["index"]
        end = markers[idx + 1]["index"] if idx + 1 < len(markers) else len(lines)
        block_text = "\n".join(lines[start:end]).strip()
        raw_blocks.append(
            {"type": marker["type"], "value": marker["value"], "text": block_text}
        )

    results: list[dict[str, Any]] = []
    current_shared_passage = None
    current_shared_range = (0, 0)

    for b in raw_blocks:
        if b["type"] == "range":
            current_shared_passage = b["text"]
            current_shared_range = b["value"]
        else:
            q_num = b["value"]
            block_text = b["text"]

            # 현재 문항이 공통 지문 범위에 속하는지 확인
            if current_shared_passage:
                if current_shared_range[0] <= q_num <= current_shared_range[1]:
                    # 지문과 문항 본문 결합
                    block_text = current_shared_passage + "\n\n" + block_text
                elif q_num > current_shared_range[1]:
                    # 범위를 벗어났으면 공통 지문 해제
                    current_shared_passage = None
                    current_shared_range = (0, 0)

            results.append(_make_block(q_num, block_text))

    logger.debug("총 %d개 문항 블록 분리 완료", len(results))
    return results


# 하위 호환 alias
split_into_questions = split_questions


def _extract_question_number(line: str) -> int:
    """문항 시작 줄에서 번호를 추출한다."""
    match = re.search(r"\d+", line)
    return int(match.group()) if match else 0


def _make_block(question_number: int, block_text: str) -> dict[str, Any]:
    """블록 dict를 생성하고 confidence / status를 결정한다."""
    char_count = len(re.sub(r"\s+", "", block_text))
    line_count = len([l for l in block_text.splitlines() if l.strip()])

    if char_count < _MIN_BLOCK_CHARS:
        confidence = 0.3
        status = "need_review"
    elif line_count < 2:
        # 문항 번호 줄만 있고 본문이 없는 경우
        confidence = 0.5
        status = "need_review"
    else:
        confidence = 0.9
        status = "candidate"

    return {
        "question_number": question_number,
        "block_text": block_text,
        "confidence": confidence,
        "status": status,
    }
