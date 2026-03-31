"""외부 SSO 토큰 검증 유틸리티"""

import logging
import httpx
from jose import jwt
from typing import Optional

logger = logging.getLogger(__name__)

# 외부 토큰 검증 API URL
EXTERNAL_VALIDATE_URL = "https://cccapi.kccc.org/checkauth"


async def validate_external_token(token: str) -> Optional[dict]:
    """외부 SSO 토큰 유효성 검증

    1. 외부 API 호출로 토큰 검증
    2. 검증 성공 시 토큰 디코딩하여 페이로드 반환

    Args:
        token: 외부 시스템에서 발급받은 JWT 토큰

    Returns:
        dict: 토큰 페이로드 (성공 시)
        None: 검증 실패 시
    """
    # 1. 외부 API로 토큰 유효성 검증
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                EXTERNAL_VALIDATE_URL,
                headers={"Authorization": f"Bearer {token}"},
                timeout=10.0,
            )

            # HTTP 상태 코드 확인
            if response.status_code != 200:
                try:
                    result = response.json()
                    error_msg = result.get("error", result.get("message", str(result)))
                except Exception:
                    error_msg = response.text
                logger.warning(f"External token validation failed: {error_msg}")
                return None

            result = response.json()

            # 검증 실패: {"error": "토큰이 유효하지 않습니다."}
            if "error" in result:
                logger.warning(
                    f"External token validation failed: {result.get('error')}"
                )
                return None

            # 검증 성공: {"status": "success", "message": "정상적인 토큰입니다."}
            if result.get("status") != "success":
                logger.warning(
                    f"External token validation failed: unexpected response {result}"
                )
                return None

            logger.info("External token validated successfully")

    except httpx.TimeoutException:
        logger.error("External token validation timeout")
        return None
    except httpx.RequestError as e:
        logger.error(f"External token validation request error: {e}")
        return None
    except Exception as e:
        logger.error(f"External token validation error: {e}")
        return None

    # 2. 토큰 디코딩하여 페이로드 추출 (서명 검증 없이 - 이미 외부 API에서 검증됨)
    try:
        # jose.jwt.decode는 key 인자가 필수이므로 더미 값 전달
        payload = jwt.decode(
            token,
            key="",  # 서명 검증 안 함
            options={
                "verify_signature": False,
                "verify_aud": False,
                "verify_iss": False,
            },
        )
        logger.info(f"External token decoded for user: {payload.get('userid')}")
        return payload
    except Exception as e:
        logger.error(f"External token decode error: {e}")
        return None
