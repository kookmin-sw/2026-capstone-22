"""PDF에서 텍스트를 block 단위로 추출한다."""

import logging
from typing import Any

import fitz  # PyMuPDF

logger = logging.getLogger(__name__)


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
