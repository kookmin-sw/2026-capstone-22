"""
개인정보 필터링 유틸리티

응답 텍스트에서 민감한 개인정보를 마스킹 처리합니다:
- 휴대폰 번호 (010, 011, 016, 017, 018, 019로 시작)
- 주민등록번호
- 신용카드 번호
"""

import re
import logging

logger = logging.getLogger(__name__)


def mask_phone_numbers(text: str) -> str:
    """휴대폰 번호 마스킹

    패턴:
    - 010-1234-5678, 010.1234.5678, 010 1234 5678
    - 01012345678
    - 011-123-4567, 016-123-4567 등
    """
    # 하이픈, 점, 공백으로 구분된 휴대폰 번호
    # 010-XXXX-XXXX 또는 01X-XXX-XXXX
    pattern1 = r'(01[016789])[-.\s]?(\d{3,4})[-.\s]?(\d{4})'

    def replace_phone(match):
        prefix = match.group(1)
        return f'{prefix}-****-****'

    return re.sub(pattern1, replace_phone, text)


def mask_resident_registration_numbers(text: str) -> str:
    """주민등록번호 마스킹

    패턴:
    - 901231-1234567
    - 9012311234567
    - 90-12-31-1234567
    """
    # 주민번호: 생년월일(6자리) + 성별/출생년대(1자리) + 나머지(6자리)
    # YYMMDD-XXXXXXX 형식
    pattern = r'(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[-.\s]?([1-4])(\d{6})'

    def replace_rrn(match):
        return f'{match.group(1)}****-*******'

    return re.sub(pattern, replace_rrn, text)


def mask_credit_card_numbers(text: str) -> str:
    """신용카드 번호 마스킹

    패턴:
    - 1234-5678-9012-3456
    - 1234 5678 9012 3456
    - 1234567890123456
    """
    # 16자리 카드번호 (4자리씩 구분되거나 연속)
    pattern = r'(\d{4})[-.\s]?(\d{4})[-.\s]?(\d{4})[-.\s]?(\d{4})'

    def replace_card(match):
        return f'{match.group(1)}-****-****-****'

    return re.sub(pattern, replace_card, text)


def mask_email_addresses(text: str) -> str:
    """이메일 주소 부분 마스킹 (선택적)

    패턴:
    - user@example.com → u***@example.com
    """
    pattern = r'([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})'

    def replace_email(match):
        local = match.group(1)
        domain = match.group(2)
        if len(local) > 2:
            masked_local = local[0] + '***'
        else:
            masked_local = '***'
        return f'{masked_local}@{domain}'

    return re.sub(pattern, replace_email, text)


def filter_pii(text: str, include_email: bool = False) -> str:
    """모든 개인정보 필터링 적용

    Args:
        text: 필터링할 텍스트
        include_email: 이메일도 마스킹할지 여부 (기본값: False)

    Returns:
        개인정보가 마스킹된 텍스트
    """
    if not text:
        return text

    original_text = text

    # 1. 주민등록번호 (가장 먼저 - 다른 패턴과 겹칠 수 있음)
    text = mask_resident_registration_numbers(text)

    # 2. 신용카드 번호
    text = mask_credit_card_numbers(text)

    # 3. 휴대폰 번호
    text = mask_phone_numbers(text)

    # 4. 이메일 (선택적)
    if include_email:
        text = mask_email_addresses(text)

    # 변경사항 로깅
    if text != original_text:
        logger.info("PII filtering applied to response")

    return text
