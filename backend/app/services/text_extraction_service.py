"""PDF에서 텍스트를 block 단위로 추출한다. 스캔 PDF/이미지는 Vision OCR로 fallback한다."""

import logging
import os
import tempfile
from typing import Any

import fitz  # PyMuPDF

from .ocr_service import extract_text_with_vision

logger = logging.getLogger(__name__)

_IMAGE_MIME_TYPES = {"image/jpeg", "image/jpg", "image/png"}
_SCANNED_THRESHOLD = 100  # full_text 길이가 이 값 미만이면 스캔 PDF로 판단


def extract_text_from_pdf(file_path: str, mime_type: str) -> dict[str, Any]:
    """PDF 파일에서 block 단위 텍스트를 추출한다.

    Returns:
        {
            "extraction_method": "pdf_parser",
            "scanned_pdf_possible": bool,
            "pages": [{"page_number": int, "blocks": [{"text": str, "x0": float, "y0": float}]}],
            "full_text": str,
        }
    """
    pages: list[dict[str, Any]] = []
    full_text_parts: list[str] = []

    try:
        doc = fitz.open(file_path)
    except Exception as exc:
        logger.error("PDF 열기 실패 file_path=%s: %s", file_path, exc)
        raise

    try:
        for page_index in range(len(doc)):
            page = doc[page_index]
            raw_blocks = page.get_text("blocks")  # (x0, y0, x1, y1, text, block_no, block_type)

            blocks: list[dict[str, Any]] = []
            for block in raw_blocks:
                x0, y0, _x1, _y1, text, _block_no, block_type = block
                if block_type != 0:  # 0 = 텍스트 블록, 1 = 이미지 블록
                    continue
                cleaned = text.strip()
                if not cleaned:
                    continue
                blocks.append({"text": cleaned, "x0": float(x0), "y0": float(y0)})
                full_text_parts.append(cleaned)

            pages.append({"page_number": page_index + 1, "blocks": blocks})
            logger.debug("page %d: %d blocks extracted", page_index + 1, len(blocks))
    finally:
        doc.close()

    full_text = "\n".join(full_text_parts)
    scanned_pdf_possible = len(full_text) < 100

    if scanned_pdf_possible:
        logger.warning(
            "추출된 텍스트가 100자 미만(%d자) — 스캔 PDF 가능성 있음: %s",
            len(full_text),
            file_path,
        )

    return {
        "extraction_method": "pdf_parser",
        "scanned_pdf_possible": scanned_pdf_possible,
        "pages": pages,
        "full_text": full_text,
    }


def extract_text_hybrid(file_path: str, mime_type: str) -> dict[str, Any]:
    """PDF 또는 이미지에서 텍스트를 추출한다. 스캔 PDF/이미지는 Vision OCR로 fallback한다.

    흐름:
    - 이미지(jpg/png) → Vision OCR 바로 실행
    - PDF → extract_text_from_pdf 먼저 시도
        - full_text >= 100자  → pdf_parser 결과 그대로 반환
        - full_text < 100자  → 각 페이지를 이미지로 렌더링 후 Vision OCR 실행

    Returns:
        {
            "extraction_method": "pdf_parser" | "vision_ocr" | "hybrid_ocr",
            "scanned_pdf_possible": bool,
            "pages": [{"page_number": int, "blocks": [{"text": str, "x0": float, "y0": float}]}],
            "full_text": str,
            "error": str | None,
        }
    """
    mime_lower = (mime_type or "").lower()

    if mime_lower in _IMAGE_MIME_TYPES:
        return _ocr_image_file(file_path)

    # PDF 경로
    try:
        pdf_result = extract_text_from_pdf(file_path, mime_type)
    except Exception as exc:
        msg = f"PDF 파서 실패: {exc}"
        logger.error(msg)
        return _empty_result("hybrid_ocr", error=msg)

    if len(pdf_result["full_text"]) >= _SCANNED_THRESHOLD:
        pdf_result["error"] = None
        return pdf_result

    # 스캔 PDF — 페이지별 OCR fallback
    logger.info("스캔 PDF 감지, OCR fallback 시작: %s", file_path)
    return _ocr_pdf_pages(file_path, pdf_result)


# ── 내부 헬퍼 ─────────────────────────────────────────────────────────────────

def _ocr_image_file(file_path: str) -> dict[str, Any]:
    """단일 이미지 파일에 Vision OCR을 실행한다."""
    ocr = extract_text_with_vision(file_path)
    page = {"page_number": 1, "blocks": ocr["blocks"]}
    return {
        "extraction_method": "vision_ocr",
        "scanned_pdf_possible": False,
        "pages": [page],
        "full_text": ocr["raw_text"],
        "error": ocr.get("error"),
    }


def _ocr_pdf_pages(file_path: str, pdf_result: dict[str, Any]) -> dict[str, Any]:
    """PDF의 각 페이지를 이미지로 렌더링한 뒤 Vision OCR로 텍스트를 추출한다."""
    pages: list[dict[str, Any]] = []
    full_text_parts: list[str] = []
    first_error: str | None = None

    try:
        doc = fitz.open(file_path)
    except Exception as exc:
        msg = f"OCR fallback 중 PDF 열기 실패: {exc}"
        logger.error(msg)
        return _empty_result("hybrid_ocr", error=msg)

    try:
        for page_index in range(len(doc)):
            page = doc[page_index]
            tmp_path: str | None = None
            try:
                # 해상도 2배 확대 — OCR 정확도 향상
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                    tmp_path = tmp.name
                pix.save(tmp_path)

                ocr = extract_text_with_vision(tmp_path)
                if ocr.get("error") and first_error is None:
                    first_error = ocr["error"]

                blocks = ocr["blocks"]
                raw_text = ocr["raw_text"].strip()
            finally:
                if tmp_path and os.path.exists(tmp_path):
                    os.remove(tmp_path)

            pages.append({"page_number": page_index + 1, "blocks": blocks})
            if raw_text:
                full_text_parts.append(raw_text)
            logger.debug("OCR page %d: %d blocks", page_index + 1, len(blocks))
    finally:
        doc.close()

    full_text = "\n".join(full_text_parts)
    return {
        "extraction_method": "hybrid_ocr",
        "scanned_pdf_possible": True,
        "pages": pages,
        "full_text": full_text,
        "error": first_error,
    }


def _empty_result(method: str, error: str | None = None) -> dict[str, Any]:
    return {
        "extraction_method": method,
        "scanned_pdf_possible": True,
        "pages": [],
        "full_text": "",
        "error": error,
    }
