"""문제은행 LLM 도구: 연습 문제 조회"""

import html as _html_mod
import logging
import random
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from ..models.exam_paper import ExamPaper, QuestionItem, ReviewStatus

logger = logging.getLogger(__name__)

QUESTION_BANK_FUNCTION_DECLARATIONS = [
    {
        "name": "get_practice_questions",
        "description": (
            "문제은행에서 특정 학년·영역에 맞는 연습 문제를 가져옵니다. "
            "학부모가 문제를 요청할 때 사용하세요. "
            "grade와 area가 모두 확인된 경우에만 호출하고, "
            "불명확한 항목이 있으면 먼저 학부모에게 물어보세요."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "grade": {
                    "type": "string",
                    "description": "학년 (예: 중1, 중2, 중3, 고1, 고2, 고3). 중1부터 고3까지 가능. 학부모가 명시하지 않았으면 null.",
                },
                "area": {
                    "type": "string",
                    "description": "문제 영역: 문법, 어휘, 독해, 듣기, 서술형 중 하나. 불명확하면 null.",
                },
                "count": {
                    "type": "integer",
                    "description": "요청한 문제 수. 학부모가 명시하지 않으면 3.",
                },
            },
            "required": [],
        },
    }
]


def execute_question_bank_tool(
    func_name: str,
    func_args: dict,
    tenant_id: Optional[int],
    db: Session,
) -> dict:
    if func_name == "get_practice_questions":
        return _get_practice_questions(tenant_id, db, **func_args)
    return {"error": f"알 수 없는 함수: {func_name}"}


def _get_practice_questions(
    tenant_id: Optional[int],
    db: Session,
    grade: Optional[str] = None,
    area: Optional[str] = None,
    count: int = 3,
) -> dict:
    """검수 완료된 문항에서 조건에 맞는 문제를 랜덤으로 조회한다."""
    if not tenant_id:
        return {"found": 0, "questions": [], "message": "테넌트 정보를 찾을 수 없습니다."}

    try:
        q = (
            db.query(QuestionItem)
            .join(ExamPaper, QuestionItem.paper_id == ExamPaper.id)
            .filter(
                QuestionItem.tenant_id == tenant_id,
                QuestionItem.review_status == ReviewStatus.reviewed,
                QuestionItem.question_body.isnot(None),
            )
        )

        if grade:
            q = q.filter(ExamPaper.grade == grade)
        if area:
            q = q.filter(QuestionItem.area == area)

        items = q.all()
        total_found = len(items)

        if total_found == 0:
            return {
                "found": 0,
                "questions": [],
                "message": "조건에 맞는 검수 완료 문제가 없습니다.",
            }

        sample_count = min(count, total_found)
        sampled = random.sample(items, sample_count)

        formatted = []
        for i, item in enumerate(sampled, 1):
            header = f"[문항 {i}]"
            meta = " · ".join(filter(None, [item.area, item.difficulty]))
            if meta:
                header += f" ({meta})"
            parts = [header]
            if item.question_body:
                parts.append(item.question_body.strip())
            if item.choices:
                parts.extend(str(c) for c in item.choices)
            formatted.append("\n".join(parts))

        raw_items = [
            {
                "question_number": item.question_number,
                "area": item.area,
                "difficulty": item.difficulty,
                "score_point": item.score_point,
                "question_body": item.question_body,
                "choices": item.choices or [],
                "answer": item.answer,
            }
            for item in sampled
        ]

        return {
            "found": total_found,
            "returned": sample_count,
            "requested": count,
            "grade": grade,
            "area": area,
            "questions": formatted,
            "_raw_items": raw_items,  # HTML 생성용 (LLM에 전달 전 제거됨)
        }
    except Exception as e:
        logger.exception("[QuestionBank] get_practice_questions failed")
        return {"error": str(e), "questions": []}


def generate_question_html(
    items: list[dict],
    grade: Optional[str] = None,
    area: Optional[str] = None,
) -> str:
    """ExamAnalysisPage.js openPrintPreview()와 동일한 출력용 HTML을 생성한다."""

    def esc(s: str) -> str:
        return _html_mod.escape(str(s)) if s else ""

    meta_parts = []
    if grade:
        meta_parts.append(f"학년: {grade}")
    if area:
        meta_parts.append(f"영역: {area}")
    filter_desc = " | ".join(meta_parts) if meta_parts else "전체"
    today = date.today().strftime("%Y.%m.%d")

    questions_html = ""
    for idx, item in enumerate(items, 1):
        score = f'<span class="score">[{item["score_point"]}점]</span>' if item.get("score_point") else ""
        body = (
            f'<div class="body">{esc(item["question_body"]).replace(chr(10), "<br>")}</div>'
            if item.get("question_body")
            else ""
        )
        choices_html = ""
        if item.get("choices"):
            choice_items = "".join(
                f'<div class="choice">{esc(c)}</div>' for c in item["choices"]
            )
            choices_html = f'<div class="choices">{choice_items}</div>'
        questions_html += (
            f'<div class="question">'
            f'<p class="qnum">{idx}. {score}</p>'
            f"{body}{choices_html}"
            f"</div>"
        )

    answer_items = [
        f'<span class="ans">{idx}.&nbsp;{esc(item["answer"])}</span>'
        for idx, item in enumerate(items, 1)
        if item.get("answer")
    ]
    answer_section = (
        f'<div class="answer-section"><h2>정 답</h2>'
        f'<div class="ans-grid">{"".join(answer_items)}</div></div>'
        if answer_items
        else ""
    )

    return f"""<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><title>문제지 출력</title>
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo','Nanum Gothic',sans-serif;font-size:10.5pt;color:#111;background:#fff}}
.page{{max-width:190mm;margin:0 auto;padding:16mm 14mm}}
.header{{border-bottom:2.5px solid #111;padding-bottom:8px;margin-bottom:16px;text-align:center}}
.header h1{{font-size:16pt;font-weight:700;letter-spacing:.04em}}
.header .meta{{font-size:8.5pt;color:#555;margin-top:4px}}
.questions-wrap{{column-count:2;column-gap:10mm;column-rule:1px solid #ccc}}
.question{{margin-bottom:14px;break-inside:avoid;page-break-inside:avoid;display:inline-block;width:100%}}
.qnum{{font-weight:700;font-size:10.5pt;margin-bottom:3px}}
.score{{font-size:9pt;color:#777;font-weight:400;margin-left:4px}}
.body{{font-size:10pt;line-height:1.65;margin:4px 0 6px 12px;white-space:pre-wrap;word-break:break-word}}
.choices{{margin-left:12px;display:flex;flex-direction:column;gap:2px}}
.choice{{font-size:10pt;line-height:1.55}}
.answer-section{{margin-top:24px;border-top:1.5px solid #aaa;padding-top:12px}}
.answer-section h2{{font-size:10.5pt;font-weight:700;margin-bottom:8px}}
.ans-grid{{display:flex;flex-wrap:wrap;gap:3px 16px;font-size:9.5pt}}
.ans{{white-space:nowrap}}
@media print{{
  @page{{size:A4;margin:14mm 12mm}}
  body{{-webkit-print-color-adjust:exact}}
  .page{{padding:0;max-width:100%}}
  .questions-wrap{{column-count:2}}
  .question{{break-inside:avoid;page-break-inside:avoid}}
  .answer-section{{break-before:avoid}}
  .print-btn{{display:none}}
}}
.print-btn{{
  position:fixed;top:16px;right:16px;
  padding:8px 16px;background:#7c3aed;color:#fff;border:none;
  border-radius:8px;font-size:10pt;cursor:pointer;
}}
</style></head>
<body>
<button class="print-btn" onclick="window.print()">인쇄 / PDF 저장</button>
<div class="page">
<div class="header">
  <h1>문제지 출력</h1>
  <p class="meta">{esc(filter_desc)}&nbsp;&nbsp;|&nbsp;&nbsp;총 {len(items)}문항&nbsp;&nbsp;|&nbsp;&nbsp;{today}</p>
</div>
<div class="questions-wrap">
{questions_html}
</div>
{answer_section}
</div>
<script>window.onload=()=>window.print();</script>
</body></html>"""
