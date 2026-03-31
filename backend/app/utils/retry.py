"""
Google 공식 retry 라이브러리를 활용한 Gemini API 재시도 유틸리티

Reference: https://github.com/google-gemini/cookbook/blob/main/quickstarts/Error_handling.ipynb

지원되는 transient 에러들 (if_transient_error 자동 처리):
- ServiceUnavailable (503)
- ResourceExhausted (429 rate limit)
- DeadlineExceeded
- Aborted
- InternalServerError
"""

from google.api_core import retry
from google.api_core import exceptions as google_exceptions
import logging

logger = logging.getLogger(__name__)


def _log_retry(retry_state):
    """Retry 시 로깅 콜백"""
    logger.warning(
        f"Retrying due to {retry_state.exception()}, "
        f"attempt {retry_state.fn.__name__ if hasattr(retry_state, 'fn') else 'unknown'}"
    )


# Gemini API에서 발생할 수 있는 재시도 가능 에러들
RETRIABLE_EXCEPTIONS = (
    google_exceptions.ServiceUnavailable,  # 503
    google_exceptions.ResourceExhausted,  # 429 rate limit
    google_exceptions.DeadlineExceeded,
    google_exceptions.Aborted,
    google_exceptions.InternalServerError,  # 500
)


def is_retriable_error(exception):
    """재시도 가능한 에러인지 확인"""
    if isinstance(exception, RETRIABLE_EXCEPTIONS):
        return True
    # 문자열로 503 체크 (일부 에러는 문자열로만 식별 가능)
    if "503" in str(exception) or "Service Unavailable" in str(exception):
        return True
    return False


# 일반 API 호출용 (기본 설정)
DEFAULT_RETRY = retry.Retry(
    predicate=retry.if_transient_error,
    initial=1.0,  # 초기 대기: 1초
    maximum=60.0,  # 최대 대기: 60초
    multiplier=2.0,  # 지수 증가: 2배씩
    timeout=120,  # 총 재시도 시간: 2분
)

# 문서 삭제 작업용 (더 긴 대기 시간)
DOCUMENT_DELETION_RETRY = retry.Retry(
    predicate=retry.if_transient_error,
    initial=2.0,  # 초기 대기: 2초
    maximum=64.0,  # 최대 대기: 64초
    multiplier=2.0,  # 지수 증가: 2배씩
    timeout=300,  # 총 재시도 시간: 5분
)

# Corpus(File Search Store) 삭제용 (가장 긴 대기 시간 - 대용량 삭제 시 필요)
CORPUS_DELETION_RETRY = retry.Retry(
    predicate=is_retriable_error,  # 커스텀 predicate 사용
    initial=5.0,  # 초기 대기: 5초
    maximum=120.0,  # 최대 대기: 120초
    multiplier=2.0,  # 지수 증가: 2배씩
    timeout=900,  # 총 재시도 시간: 15분
)

# 일괄 삭제 작업용 (배치 처리 시)
BATCH_DELETION_RETRY = retry.Retry(
    predicate=is_retriable_error,
    initial=3.0,  # 초기 대기: 3초
    maximum=90.0,  # 최대 대기: 90초
    multiplier=2.0,  # 지수 증가: 2배씩
    timeout=600,  # 총 재시도 시간: 10분
)


def with_retry(retry_config=DEFAULT_RETRY):
    """데코레이터: 함수에 재시도 로직 적용

    Usage:
        @with_retry(DOCUMENT_DELETION_RETRY)
        def delete_something():
            ...
    """

    def decorator(func):
        def wrapper(*args, **kwargs):
            @retry_config
            def _inner():
                return func(*args, **kwargs)

            return _inner()

        wrapper.__name__ = func.__name__
        wrapper.__doc__ = func.__doc__
        return wrapper

    return decorator
