"""이미지 파일 또는 PDF 페이지 이미지에서 Vision OCR로 텍스트를 추출한다."""

import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def extract_text_with_vision(image_path: str) -> dict[str, Any]:
    """Google Cloud Vision API로 이미지에서 텍스트를 추출한다.

    기존 GCP credentials 환경(GOOGLE_APPLICATION_CREDENTIALS 또는 ADC)을 재사용한다.

    Returns:
        {
            "extraction_method": "vision_ocr",
            "raw_text": str,
            "blocks": [{"text": str, "x0": float, "y0": float}],
            "error": str | None,
        }
    """
    try:
        from google.cloud import vision  # lazy import — 선택적 의존성
    except ImportError as exc:
        msg = f"google-cloud-vision 패키지가 설치되어 있지 않습니다: {exc}"
        logger.error(msg)
        return _error_result(msg)

    image_bytes = _read_image(image_path)
    if image_bytes is None:
        msg = f"이미지 파일을 읽을 수 없습니다: {image_path}"
        return _error_result(msg)

    try:
        client = vision.ImageAnnotatorClient()
        image = vision.Image(content=image_bytes)
        response = client.document_text_detection(image=image)
    except Exception as exc:
        msg = f"Vision API 호출 실패 ({image_path}): {exc}"
        logger.error(msg)
        return _error_result(msg)

    if response.error.message:
        msg = f"Vision API 오류 응답: {response.error.message}"
        logger.error(msg)
        return _error_result(msg)

    raw_text = ""
    blocks: list[dict[str, Any]] = []

    annotation = response.full_text_annotation
    if annotation and annotation.text:
        raw_text = annotation.text
        blocks = _extract_blocks(annotation)

    logger.debug(
        "Vision OCR 완료: %s — %d자, %d blocks",
        Path(image_path).name,
        len(raw_text),
        len(blocks),
    )
    return {
        "extraction_method": "vision_ocr",
        "raw_text": raw_text,
        "blocks": blocks,
        "error": None,
    }


# ── 내부 헬퍼 ─────────────────────────────────────────────────────────────────

def _read_image(image_path: str) -> bytes | None:
    try:
        with open(image_path, "rb") as f:
            return f.read()
    except OSError as exc:
        logger.error("이미지 파일 읽기 실패 %s: %s", image_path, exc)
        return None


def _extract_blocks(annotation: Any) -> list[dict[str, Any]]:
    """full_text_annotation에서 block 단위 텍스트와 좌표를 추출한다."""
    blocks: list[dict[str, Any]] = []

    for page in annotation.pages:
        for block in page.blocks:
            block_text = _block_to_text(block).strip()
            if not block_text:
                continue
            vertices = block.bounding_box.vertices
            x0 = float(vertices[0].x) if vertices else 0.0
            y0 = float(vertices[0].y) if vertices else 0.0
            blocks.append({"text": block_text, "x0": x0, "y0": y0})

    return blocks


def _block_to_text(block: Any) -> str:
    """Vision API block 객체를 텍스트 문자열로 변환한다."""
    para_texts: list[str] = []
    for paragraph in block.paragraphs:
        word_texts: list[str] = []
        for word in paragraph.words:
            word_texts.append("".join(symbol.text for symbol in word.symbols))
        para_texts.append(" ".join(word_texts))
    return "\n".join(para_texts)


def _error_result(message: str) -> dict[str, Any]:
    return {
        "extraction_method": "vision_ocr",
        "raw_text": "",
        "blocks": [],
        "error": message,
    }
