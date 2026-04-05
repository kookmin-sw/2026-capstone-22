"""Chatbot query service — smart query with RAG, web search, calendar, and file chat"""

from google.genai import types
from typing import List, Optional, Dict
import logging
import json
from sqlalchemy.orm import Session
from vertexai import rag
from vertexai.generative_models import GenerativeModel, Tool as VertexTool
from ..utils.pii_filter import filter_pii
from .gemini_client import (
    _get_genai_client,
    _get_model_generation_params,
    _init_vertex_ai_global,
)

logger = logging.getLogger(__name__)


class AgentType:
    CONSULTING = "CONSULTING"
    PERSONAL = "PERSONAL"
    REPORT = "REPORT"
    ADMIN = "ADMIN"


class RouterAgent:
    """Central control agent that classifies user intent and routes to specialized agents."""

    ROUTER_INSTRUCTION = """당신은 학원 관리 플랫폼 'ReadyTalk'의 중앙 관제 에이전트입니다.
사용자의 질문을 분석하여 가장 적합한 에이전트 타입을 하나만 선택하세요.

[에이전트 타입 및 역할]
1. CONSULTING: 입학 상담, 학원 위치, 수강료 문의, 일반적인 학원 매뉴얼 안내. (미인증 사용자의 기본 창구)
2. PERSONAL: 나의 수업 일정, 결석 신고, 보강 날짜 잡기, 출석 확인. (본인 데이터 관련)
3. REPORT: 성적 분석, 월간 학습 리포트 브리핑, 취약점 분석.
4. ADMIN: 상담 내용 요약, 시스템 설정 변경, 관리자 전용 기능.

[규칙]
- 사용자의 질문 의도가 위 4개 중 어디에 해당하는지 판단하세요.
- 오직 에이전트 타입 이름(예: CONSULTING)만 답변하세요.
- 판단이 모호하면 CONSULTING을 선택하세요.
"""

    @staticmethod
    def determine_agent(query: str, is_authenticated: bool) -> str:
        """Classify intent using a lightweight LLM call."""
        try:
            # If not authenticated, most requests should go to CONSULTING
            # (unless it's a general greeting, etc.)
            
            prompt = f"사용자 질문: \"{query}\"\n인증 상태: {'로그인됨' if is_authenticated else '비인증'}\n\n위 질문에 가장 적합한 에이전트 타입은?"
            
            gen_params = _get_model_generation_params()
            # Use flash model for fast and cheap routing
            response = _get_genai_client().models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=RouterAgent.ROUTER_INSTRUCTION,
                    temperature=0.1, # Low temperature for consistent classification
                    **{k: v for k, v in gen_params.items() if k not in ["temperature", "thinking_config"]}
                )
            )
            
            agent_type = response.text.strip().upper()
            
            # Validation: Fallback to CONSULTING if LLM returns unexpected text
            valid_types = [AgentType.CONSULTING, AgentType.PERSONAL, AgentType.REPORT, AgentType.ADMIN]
            if agent_type not in valid_types:
                logger.warning(f"Router returned invalid agent type: {agent_type}. Falling back to CONSULTING.")
                return AgentType.CONSULTING
                
            # Security Guard: If not authenticated but requesting PERSONAL/REPORT, route back to CONSULTING
            if not is_authenticated and agent_type in [AgentType.PERSONAL, AgentType.REPORT]:
                logger.info(f"Unauthenticated access to {agent_type} blocked. Routing to CONSULTING.")
                return AgentType.CONSULTING
                
            return agent_type
        except Exception as e:
            logger.error(f"Error in RouterAgent: {e}")
            return AgentType.CONSULTING


class ChatService:
    """Service for chatbot queries — RAG search, web search, calendar, file chat"""

    # Tone/style mappings for system prompt generation
    TONE_INSTRUCTIONS = {
        "friendly": "친근하게 반말(해요체)로 대화하세요.",
        "polite": "존댓말(~합니다, ~입니다)로 정중하게 답변하세요.",
        "professional": "전문적인 어투로 명확하고 신뢰감 있게 답변하세요.",
        "formal": "격식체(~하십시오, ~드립니다)를 사용하여 공식적으로 답변하세요.",
    }

    STYLE_INSTRUCTIONS = {
        "concise": "간결하게 핵심만 답변하세요.",
        "detailed": "충분한 설명과 맥락을 포함하여 상세하게 답변하세요.",
        "balanced": "적절한 분량으로 핵심 내용과 간단한 설명을 포함하세요.",
    }

    @staticmethod
    def build_system_instruction(
        tenant_name: str,
        chatbot_settings=None,
        today_str: str = None,
        weekday_str: str = None,
        now_time_str: str = None,
        has_calendar: bool = False,
        is_smart_query: bool = False,
        web_search_enabled: bool = False,
    ) -> str:
        """Build system instruction dynamically based on tenant chatbot settings.

        Args:
            tenant_name: Tenant display name
            chatbot_settings: ChatbotSettings model instance (or None for defaults)
            today_str, weekday_str, now_time_str: Current time info (for smart query)
            has_calendar: Whether calendar functions are available
            is_smart_query: Whether this is a smart query with function calling
        """
        # Determine bot identity
        if chatbot_settings and chatbot_settings.chatbot_name:
            bot_name = chatbot_settings.chatbot_name
        else:
            bot_name = f"{tenant_name}의 AI 어시스턴트"

        # Determine tone and style
        tone = "polite"
        style = "concise"
        if chatbot_settings:
            tone = chatbot_settings.tone or "polite"
            style = chatbot_settings.response_style or "concise"

        tone_text = ChatService.TONE_INSTRUCTIONS.get(
            tone, ChatService.TONE_INSTRUCTIONS["polite"]
        )
        style_text = ChatService.STYLE_INSTRUCTIONS.get(
            style, ChatService.STYLE_INSTRUCTIONS["concise"]
        )

        # Greeting instruction
        greeting_section = ""
        if chatbot_settings and chatbot_settings.greeting_message:
            greeting_section = f'\n## 인삿말\n- 사용자가 처음 인사하거나 자기소개를 요청하면 다음과 같이 인사하세요: "{chatbot_settings.greeting_message}"\n'

        # Custom instructions
        custom_section = ""
        if chatbot_settings and chatbot_settings.custom_instructions:
            custom_section = (
                f"\n## 추가 지시사항\n{chatbot_settings.custom_instructions}\n"
            )

        consulting_section = f"""
## [상담 에이전트 운영 규칙]

- 당신은 {tenant_name}의 신규 학부모 상담 도우미입니다.
- 학부모가 학원 정보를 쉽게 이해할 수 있도록 친절하고 자연스럽게 안내하세요.
- 답변은 반드시 문서 검색 결과를 바탕으로 작성하세요.
- 학원 소개, 수강료, 교육과정, 운영시간, 등록 절차와 같은 질문에는
  먼저 문서 검색 결과를 바탕으로 최대한 답변하세요.
- 문서에 있는 내용이면 별도의 태그 없이 일반 답변으로 안내하세요.
- 문서 검색 결과가 없거나, 검색 결과만으로 정확한 답변이 어려운 경우에만 상담 연결이 필요하다고 안내하세요.

## [CTA 규칙]
- 사용자가 등록/입학 의사를 직접 표현하는 경우에만
  답변 마지막 줄에 아래 태그를 추가하세요.
<CTA>레벨테스트예약</CTA>

- 단순 정보 질문(운영시간, 위치, 수강료, 커리큘럼 등)에는 CTA 태그를 추가하지 마세요.

## [HITL 규칙]
- 아래와 같은 경우에만 답변 마지막 줄에 HITL 태그를 추가하세요.
  - 수강료 할인, 예외 적용, 협의 요청
  - 불만, 컴플레인, 민원
  - 문서에 없는 내용을 운영자 판단으로 확인해야 하는 경우

- 단순히 문서 검색 결과가 짧거나 애매하다는 이유만으로 HITL 태그를 추가하지 마세요.
- HITL 태그가 필요한 경우 아래 형식을 사용하세요.
<HITL>요약된 사유</HITL>

## [출력 규칙]
- 태그는 필요한 경우에만 답변 마지막 줄에 추가하세요.
- 태그가 필요 없으면 일반 답변만 출력하세요.
- 태그 뒤에 다른 문장을 붙이지 마세요.
"""
        # Time info section (for smart query)
        time_section = ""
        if today_str and weekday_str and now_time_str:
            time_section = f"""
## 현재 시간 정보
- 오늘 날짜: {today_str} ({weekday_str})
- 현재 시간: {now_time_str} (KST)
"""

        # Calendar section
        calendar_section = ""
        if has_calendar:
            calendar_section = """
## 캘린더 기능
- 일정 조회, 생성, 수정, 삭제가 가능합니다.
- 사용자가 일정 관련 요청을 하면 적절한 캘린더 함수를 호출하세요.
- 일정 생성 시 시간대는 Asia/Seoul (KST, +09:00)을 사용하세요.
- 반드시 오늘 날짜를 기준으로 "이번 주", "내일", "다음 주" 등을 계산하세요.
"""

        # Function calling rules (for smart query only)
        function_rules = ""
        if is_smart_query:
            function_rules = """
## 함수 호출 규칙 (매우 중요)
- **현재 사용자 메시지의 의도만** 분석하여 필요한 함수를 결정하세요. 이전 대화에서 호출했던 함수를 자동으로 다시 호출하지 마세요.
- 사용자가 특정 주제, 정보, 지식에 대해 질문하면 **반드시 search_documents 함수를 호출**하세요. 일반 지식으로 답변하지 말고 문서를 먼저 검색하세요.
- 인사, 감사, 작별 등 단순한 대화에만 함수를 호출하지 마세요.
"""

        # Build core rules based on web_search_enabled
        if web_search_enabled:
            rule1 = "**문서 검색과 웹 검색을 활용하여** 답변하세요. 문서에 관련 정보가 있으면 문서를 우선 활용하고, 문서에 없는 내용은 웹 검색을 통해 답변하세요."
            rule2 = "문서에 관련 정보가 없으면 **웹 검색(search_web)을 적극 활용**하여 답변하세요. 웹 검색 결과를 기반으로 답변할 때는 출처가 웹임을 명시하세요."
            rule4 = "문서 기반 정보와 웹 검색 정보를 명확히 구분하여 답변하세요."
        else:
            rule1 = "**반드시 문서 검색 결과에 기반하여** 답변하세요. 문서에 있는 내용만 사용하고, 문서에 없는 내용을 추측하거나 지어내지 마세요."
            rule2 = '문서 검색 결과가 질문과 **관련이 없거나 충분한 정보가 없으면**, "해당 내용은 저장된 문서에서 찾을 수 없습니다."라고 솔직하게 안내하세요. 절대 일반 지식으로 답변을 대체하지 마세요.'
            rule4 = "문서 기반 답변에 문서에 없는 추가 정보를 섞지 마세요."

        no_func_prefix = "함수를 호출하지 말고 " if is_smart_query else ""
        rule6 = (
            "6. **현재 질문에 대한 답변만 하세요.** 이전 대화에서 이미 답변한 내용을 반복하지 마세요."
            if is_smart_query
            else ""
        )

        # Build final instruction
        instruction = f"""당신은 {bot_name}입니다.
{time_section}
## 말투 및 응답 스타일
- {tone_text}
- {style_text}
{greeting_section}
## 핵심 규칙
1. {rule1}
2. {rule2}
3. 인사, 일상 대화 등 문서 검색이 필요 없는 간단한 대화에는 {no_func_prefix}자연스럽게 응답하세요.
4. {rule4}
5. 자기소개 요청 시 {bot_name}임을 밝히고, {tenant_name}의 자료를 기반으로 답변할 수 있다고 안내하세요.
{rule6}
{function_rules}{calendar_section}
## 답변 형식
1. 한국어로 답변하세요.
2. 출처 파일명이나 경로를 본문에 언급하지 마세요. 출처는 시스템이 별도 표시합니다.

{consulting_section}

{custom_section}"""

        return instruction

    @staticmethod
    def upload_file_for_chat(file_path: str, display_name: str, mime_type: str) -> dict:
        """Upload a file temporarily for chat (24-48 hours)"""
        try:
            uploaded_file = _get_genai_client().files.upload(file=file_path)
            logger.info(
                f"Uploaded file for chat: {display_name} (URI: {uploaded_file.uri})"
            )
            return {
                "uri": uploaded_file.uri,
                "name": uploaded_file.name,
                "display_name": display_name,
                "mime_type": mime_type,
            }
        except Exception as e:
            logger.error(f"Error uploading file for chat: {e}")
            raise

    @staticmethod
    def chat_with_files(
        file_uris: List[str],
        query: str,
        model_name: str = "gemini-2.5-flash",
        corpus_names: List[str] = None,
        web_search_enabled: bool = False,
        db_session: Session = None,
        history: List[Dict] = None,
        user_group_name: Optional[str] = None,
        tenant_id: int = None,
        user_id: int = None,
        session_id: int = None,
        tenant_name: str = "ReadyTalk",
        chatbot_settings=None,
    ) -> str:
        """Chat with uploaded files"""
        try:
            current_parts = []
            for file_uri in file_uris:
                current_parts.append({"file_data": {"file_uri": file_uri}})
            current_parts.append({"text": query})

            if history:
                contents = history + [{"role": "user", "parts": current_parts}]
                logger.info(
                    f"Using conversation history with files: {len(history)} previous messages"
                )
            else:
                contents = current_parts

            effective_instruction = ChatService.build_system_instruction(
                tenant_name=tenant_name,
                chatbot_settings=chatbot_settings,
                web_search_enabled=web_search_enabled,
            )

            if corpus_names:
                _init_vertex_ai_global()
                rag_retrieval_tool = VertexTool.from_retrieval(
                    retrieval=rag.Retrieval(
                        source=rag.VertexRagStore(
                            rag_resources=[
                                rag.RagResource(rag_corpus=name)
                                for name in corpus_names
                            ],
                            rag_retrieval_config=rag.RagRetrievalConfig(
                                top_k=10,
                                filter=rag.Filter(vector_distance_threshold=0.75),
                            ),
                        ),
                    )
                )
                gen_params = _get_model_generation_params()
                rag_model = GenerativeModel(
                    model_name=model_name,
                    tools=[rag_retrieval_tool],
                    system_instruction=effective_instruction,
                    generation_config={
                        k: v for k, v in gen_params.items() if k != "thinking_config"
                    },
                )
                response = rag_model.generate_content(contents)
                if db_session and tenant_id:
                    from .usage_service import record_usage, record_retrieval_usage

                    record_usage(
                        db_session,
                        tenant_id,
                        "file_chat_rag",
                        model_name,
                        response,
                        user_id,
                        session_id,
                    )
                    record_retrieval_usage(db_session, tenant_id, user_id, session_id)
            elif web_search_enabled:
                gen_params = _get_model_generation_params()
                response = _get_genai_client().models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=effective_instruction,
                        tools=[types.Tool(google_search=types.GoogleSearch())],
                        **gen_params,
                    ),
                )
                if db_session and tenant_id:
                    from .usage_service import record_usage

                    record_usage(
                        db_session,
                        tenant_id,
                        "file_chat_web",
                        model_name,
                        response,
                        user_id,
                        session_id,
                    )
            else:
                gen_params = _get_model_generation_params()
                response = _get_genai_client().models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=effective_instruction,
                        **gen_params,
                    ),
                )
                if db_session and tenant_id:
                    from .usage_service import record_usage

                    record_usage(
                        db_session,
                        tenant_id,
                        "file_chat",
                        model_name,
                        response,
                        user_id,
                        session_id,
                    )

            logger.info(f"Chat with files successful: {len(file_uris)} file(s)")
            response_text = response.text
            return filter_pii(response_text)
        except Exception as e:
            logger.error(f"Error in chat with files: {e}")
            raise

    @staticmethod
    def query_smart(
        corpus_names: List[str],
        query: str,
        tenant_id: int,
        db_session: Session,
        model_name: str = "gemini-2.5-flash",
        history: List[Dict] = None,
        user_group_name: Optional[str] = None,
        web_search_enabled: bool = False,
        has_calendar: bool = False,
        tenant_name: str = "ReadyTalk",
        user_id: int = None,
        session_id: int = None,
        chatbot_settings=None,
    ) -> dict:
        """Unified smart query with function calling

        LLM decides which functions to call based on user intent:
        - search_documents: for document/knowledge questions
        - calendar functions: for schedule management (if has_calendar)
        - search_web: for web search (if web_search_enabled)
        - none: for general conversation, greetings, etc.

        Returns dict with 'text', 'used_calendar', and 'cited_sources' keys.
        """
        try:
            if history:
                contents = history + [{"role": "user", "parts": [{"text": query}]}]
            else:
                contents = query

            # --- [Router Step] Determine specialized agent ---
            is_authenticated = user_id is not None
            agent_type = RouterAgent.determine_agent(query, is_authenticated)
            logger.info(
                f"Routed query to agent: {agent_type} (Authenticated: {is_authenticated})"
            )

            # Build function declarations based on assigned agent
            function_declarations = []

            # 1. PERSONAL Agent: Calendar functions
            if agent_type == AgentType.PERSONAL and has_calendar:
                from .calendar_service import (
                    CALENDAR_FUNCTION_DECLARATIONS,
                    execute_calendar_function,
                )

                function_declarations.extend(CALENDAR_FUNCTION_DECLARATIONS)

            # 2. CONSULTING Agent: Document search (always fallback or specific)
            if agent_type == AgentType.CONSULTING or agent_type == AgentType.PERSONAL:
                function_declarations.append(
                    {
                        "name": "search_documents",
                        "description": "업로드된 내부 문서에서 정보를 검색합니다. 입학 상담, 학원 정책, 공지사항 등을 확인할 때 사용하세요.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "query": {
                                    "type": "string",
                                    "description": "문서에서 검색할 질문",
                                }
                            },
                            "required": ["query"],
                        },
                    }
                )

            # 3. WEB search (if enabled and applicable)
            if web_search_enabled and agent_type == AgentType.CONSULTING:
                function_declarations.append(
                    {
                        "name": "search_web",
                        "description": "웹에서 최신 정보를 검색합니다. 학원 외부 정보가 필요할 때만 사용하세요.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "query": {
                                    "type": "string",
                                    "description": "웹에서 검색할 질문",
                                }
                            },
                            "required": ["query"],
                        },
                    }
                )

            from datetime import datetime, timezone, timedelta

            kst = timezone(timedelta(hours=9))
            now_kst = datetime.now(kst)
            today_str = now_kst.strftime("%Y-%m-%d")
            weekday_names = [
                "월요일",
                "화요일",
                "수요일",
                "목요일",
                "금요일",
                "토요일",
                "일요일",
            ]
            weekday_str = weekday_names[now_kst.weekday()]
            now_time_str = now_kst.strftime("%H:%M")

            # --- [Prompt Step] Build specialized system instruction ---
            base_instruction = ChatService.build_system_instruction(
                tenant_name=tenant_name,
                chatbot_settings=chatbot_settings,
                today_str=today_str,
                weekday_str=weekday_str,
                now_time_str=now_time_str,
                has_calendar=has_calendar,
                is_smart_query=True,
                web_search_enabled=web_search_enabled,
            )

            # Add Agent-specific persona
            agent_persona = ""
            if agent_type == AgentType.PERSONAL:
                agent_persona = f"\n## 배정된 역할: 개인화 관리 에이전트\n- 당신은 현재 로그인한 사용자의 전용 비서입니다.\n- 수업 일정 확인, 결석 신고, 보강 날짜 잡기 업무를 처리하세요.\n- 답변 시 사용자의 이름을 부르며 친절하게 응대하세요."
            elif agent_type == AgentType.CONSULTING:
                agent_persona = f"\n## 배정된 역할: 입학 상담 에이전트\n- 당신은 학원 입학 및 일반 안내를 담당하는 상담 실장입니다.\n- 학원 매뉴얼을 기반으로 전문적이고 설득력 있게 답변하세요.\n- 상담이 무르익으면 '레벨 테스트'를 권유하세요."
            elif agent_type == AgentType.REPORT:
                agent_persona = f"\n## 배정된 역할: 학습 분석 에이전트\n- 당신은 학생의 성취도를 분석하는 데이터 전문가입니다.\n- 성적 및 리포트 데이터를 기반으로 객관적인 피드백을 제공하세요."

            effective_instruction = base_instruction + agent_persona

            logger.info(
                f"Starting smart query with {agent_type} persona: {query[:100]}..."
            )

            gen_params = _get_model_generation_params()
            response = _get_genai_client().models.generate_content(
                model=model_name,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=effective_instruction,
                    tools=[{"function_declarations": function_declarations}],
                    tool_config={"function_calling_config": {"mode": "AUTO"}},
                    **gen_params,
                ),
            )

            # Record usage for initial function-calling call
            if db_session and tenant_id:
                from .usage_service import record_usage

                record_usage(
                    db_session,
                    tenant_id,
                    "function_calling",
                    model_name,
                    response,
                    user_id,
                    session_id,
                )

            # Check for function calls
            if not (response.candidates and response.candidates[0].content.parts):
                return {
                    "text": filter_pii(response.text or "답변을 생성할 수 없습니다."),
                    "used_calendar": False,
                }

            parts = response.candidates[0].content.parts
            function_calls = [
                p.function_call
                for p in parts
                if hasattr(p, "function_call") and p.function_call
            ]

            if not function_calls:
                return {"text": filter_pii(response.text), "used_calendar": False}

            # Execute function calls
            logger.info(f"Executing {len(function_calls)} function call(s)")
            function_responses = []
            used_calendar = False
            cited_sources = []

            for fc in function_calls:
                func_name = fc.name
                func_args = dict(fc.args)
                logger.info(f"Calling function: {func_name} with args: {func_args}")

                if func_name.startswith(
                    (
                        "list_calendar",
                        "create_calendar",
                        "update_calendar",
                        "delete_calendar",
                    )
                ):
                    used_calendar = True
                    result = execute_calendar_function(
                        func_name, func_args, tenant_id, db_session
                    )
                    result_str = json.dumps(result, ensure_ascii=False, default=str)
                elif func_name == "search_documents":
                    logger.info(f"search_documents: corpus_names={corpus_names}")
                    if corpus_names:
                        try:
                            # Determine search backend from tenant settings
                            _search_backend = "rag_engine"
                            if db_session and tenant_id:
                                from ..models.tenant import Tenant as _Tenant

                                _tenant_obj = (
                                    db_session.query(_Tenant)
                                    .filter(_Tenant.id == tenant_id)
                                    .first()
                                )
                                if (
                                    _tenant_obj
                                    and hasattr(_tenant_obj, "search_backend")
                                    and _tenant_obj.search_backend
                                ):
                                    _search_backend = _tenant_obj.search_backend

                            all_chunks = []
                            cited_source_uri = None

                            if _search_backend == "vertex_ai_search":
                                # ── Vertex AI Search path ──
                                from .search_service import SearchService

                                if corpus_names:
                                    search_results = SearchService.search(
                                        query=func_args["query"],
                                        top_k=10,
                                        data_store_names=corpus_names,
                                    )
                                    for r in search_results:
                                        all_chunks.append(
                                            {
                                                "text": r["text"],
                                                "source": r["source"],
                                                "source_uri": "",
                                                "score": r["score"],
                                                "corpus": "vertex_ai_search",
                                            }
                                        )
                                    logger.info(
                                        f"Vertex AI Search: {len(all_chunks)} chunks found"
                                    )
                                    # Record search usage
                                    if db_session and tenant_id:
                                        from .usage_service import (
                                            record_retrieval_usage,
                                        )

                                        record_retrieval_usage(
                                            db_session,
                                            tenant_id,
                                            user_id,
                                            session_id,
                                            search_backend="vertex_ai_search",
                                        )
                                else:
                                    logger.warning(
                                        "No corpus_names available for Vertex AI Search"
                                    )
                            else:
                                # ── RAG Engine path (default) ──
                                from .gemini_client import _init_vertex_ai

                                _init_vertex_ai()

                                for corpus_name_item in corpus_names:
                                    try:
                                        # Try hybrid search first (works with Weaviate backend)
                                        try:
                                            response = rag.retrieval_query(
                                                text=func_args["query"],
                                                rag_resources=[
                                                    rag.RagResource(
                                                        rag_corpus=corpus_name_item
                                                    )
                                                ],
                                                rag_retrieval_config=rag.RagRetrievalConfig(
                                                    top_k=10,
                                                    filter=rag.Filter(
                                                        vector_distance_threshold=0.75
                                                    ),
                                                    hybrid_search=rag.HybridSearch(
                                                        alpha=0.5
                                                    ),
                                                ),
                                            )
                                            logger.info(
                                                f"Hybrid search succeeded for {corpus_name_item}"
                                            )
                                        except Exception as hybrid_err:
                                            # Fallback to vector-only search (non-Weaviate corpora)
                                            logger.info(
                                                f"Hybrid search not available for {corpus_name_item}, falling back to vector search"
                                            )
                                            response = rag.retrieval_query(
                                                text=func_args["query"],
                                                rag_resources=[
                                                    rag.RagResource(
                                                        rag_corpus=corpus_name_item
                                                    )
                                                ],
                                                rag_retrieval_config=rag.RagRetrievalConfig(
                                                    top_k=10,
                                                    filter=rag.Filter(
                                                        vector_distance_threshold=0.75
                                                    ),
                                                ),
                                            )
                                        for ctx in response.contexts.contexts:
                                            chunk_text = getattr(ctx, "text", "")
                                            if chunk_text:
                                                source_name = getattr(
                                                    ctx, "source_display_name", ""
                                                )
                                                all_chunks.append(
                                                    {
                                                        "text": chunk_text,
                                                        "source": source_name,
                                                        "source_uri": getattr(
                                                            ctx, "source_uri", ""
                                                        ),
                                                        "score": getattr(
                                                            ctx, "score", 0
                                                        ),
                                                        "corpus": corpus_name_item,
                                                    }
                                                )
                                    except Exception as corpus_err:
                                        logger.warning(
                                            f"RAG retrieval error for {corpus_name_item}: {corpus_err}"
                                        )

                            # Sort by relevance score (lower = better)
                            all_chunks.sort(key=lambda c: c["score"])

                            # Build context string from top chunks
                            if all_chunks:
                                context_parts = []
                                for chunk in all_chunks[:10]:
                                    context_parts.append(
                                        f"[출처: {chunk['source']}]\n{chunk['text']}"
                                    )
                                result_str = "\n\n---\n\n".join(context_parts)
                            else:
                                result_str = ""

                            logger.info(
                                f"RAG retrieval across {len(corpus_names)} corpora: {len(all_chunks)} chunks found"
                            )
                            for i, chunk in enumerate(all_chunks[:5]):
                                logger.info(
                                    f"  Chunk[{i}] score={chunk['score']:.4f} source={chunk['source']} text={chunk['text'][:150]}..."
                                )

                            # Build citation from retrieved chunks
                            if db_session and all_chunks:
                                from ..models.corpus import (
                                    Corpus as CorpusModel,
                                    Document,
                                )

                                # Use the best chunk's source for citation
                                best_chunk = all_chunks[0]
                                best_corpus = (
                                    db_session.query(CorpusModel)
                                    .filter(
                                        CorpusModel.corpus_name == best_chunk["corpus"]
                                    )
                                    .first()
                                )
                                if best_corpus:
                                    is_public = (
                                        best_corpus.is_public
                                        if best_corpus.is_public is not None
                                        else True
                                    )
                                    if is_public:
                                        # Find document by source display name
                                        source_name = best_chunk["source"]
                                        doc = (
                                            db_session.query(Document)
                                            .filter(
                                                Document.corpus_id == best_corpus.id,
                                                Document.gcs_path.like(
                                                    f"%{source_name}"
                                                ),
                                            )
                                            .first()
                                        )
                                        if not doc:
                                            doc = (
                                                db_session.query(Document)
                                                .filter(
                                                    Document.corpus_id
                                                    == best_corpus.id,
                                                    Document.display_name
                                                    == source_name,
                                                )
                                                .first()
                                            )
                                        if doc:
                                            cited_sources.append(
                                                {
                                                    "title": doc.display_name,
                                                    "uri": None,
                                                    "_corpus_id": best_corpus.id,
                                                    "_corpus_is_public": True,
                                                    "_corpus_name": best_corpus.display_name,
                                                }
                                            )
                                            logger.info(
                                                f"Citation from retrieval: {doc.display_name} ({best_corpus.display_name})"
                                            )
                                    else:
                                        logger.info(
                                            "Best corpus is private, no citation link provided"
                                        )

                            # Record retrieval usage
                            if db_session and tenant_id:
                                from .usage_service import record_retrieval_usage

                                record_retrieval_usage(
                                    db_session, tenant_id, user_id, session_id
                                )
                        except Exception as e:
                            logger.error(f"RAG search error: {e}")
                            result_str = f"문서 검색 중 오류 발생: {str(e)}"
                    else:
                        logger.warning(
                            f"No corpus_names available for search_documents"
                        )
                        result_str = "검색 가능한 문서가 없습니다."
                elif func_name == "search_web":
                    try:
                        search_response = _get_genai_client().models.generate_content(
                            model=model_name,
                            contents=func_args["query"],
                            config=types.GenerateContentConfig(
                                tools=[types.Tool(google_search=types.GoogleSearch())],
                                **gen_params,
                            ),
                        )
                        result_str = search_response.text
                        # Record web search usage
                        if db_session and tenant_id:
                            from .usage_service import record_usage

                            record_usage(
                                db_session,
                                tenant_id,
                                "web_search",
                                model_name,
                                search_response,
                                user_id,
                                session_id,
                            )
                    except Exception as e:
                        result_str = f"웹 검색 중 오류 발생: {str(e)}"
                else:
                    result_str = f"알 수 없는 함수: {func_name}"

                function_responses.append(
                    {
                        "function_response": {
                            "name": func_name,
                            "response": {"result": result_str},
                        }
                    }
                )

            # Send function results back to LLM
            if history:
                conversation = history + [
                    {"role": "user", "parts": [{"text": query}]},
                    {"role": "model", "parts": parts},
                ]
            else:
                conversation = [
                    {"role": "user", "parts": [{"text": query}]},
                    {"role": "model", "parts": parts},
                ]

            conversation.append(
                {
                    "role": "user",
                    "parts": function_responses,
                }
            )

            # Disable function calling for synthesis - force text-only response
            synthesis_params = {k: v for k, v in gen_params.items()}
            final_response = _get_genai_client().models.generate_content(
                model=model_name,
                contents=conversation,
                config=types.GenerateContentConfig(
                    system_instruction=effective_instruction,
                    tool_config=types.ToolConfig(
                        function_calling_config=types.FunctionCallingConfig(mode="NONE")
                    ),
                    **synthesis_params,
                ),
            )

            # Record synthesis usage
            if db_session and tenant_id:
                from .usage_service import record_usage

                record_usage(
                    db_session,
                    tenant_id,
                    "synthesis",
                    model_name,
                    final_response,
                    user_id,
                    session_id,
                )

            # Resolve the single cited source - generate signed URL
            if cited_sources:
                source = cited_sources[0]
                corpus_id = source.pop("_corpus_id", None)
                source.pop("_corpus_is_public", None)
                source.pop("_corpus_name", None)

                if db_session and corpus_id:
                    try:
                        from ..models.corpus import Document
                        from ..services import gcs_service

                        doc = (
                            db_session.query(Document)
                            .filter(
                                Document.display_name == source["title"],
                                Document.corpus_id == corpus_id,
                                Document.gcs_path.isnot(None),
                            )
                            .first()
                        )
                        if (
                            doc
                            and doc.gcs_path
                            and gcs_service.is_configured(
                                tenant_id=doc.tenant_id, db=db_session
                            )
                        ):
                            signed_url = gcs_service.generate_signed_url(
                                doc.gcs_path,
                                expiration_minutes=60,
                                tenant_id=doc.tenant_id,
                                db=db_session,
                            )
                            if signed_url:
                                source["uri"] = signed_url
                    except Exception as e:
                        logger.warning(f"Error resolving source link: {e}")

                logger.info(
                    f"Final cited sources: {len(cited_sources)} (top: {cited_sources[0]['title'] if cited_sources else 'none'})"
                )

            logger.info("Smart query completed successfully")
            logger.info(
                f"Synthesis response (first 500 chars): {final_response.text[:500] if final_response.text else 'NO TEXT'}"
            )

            # Extract text from final response, handling cases where LLM returns function_call instead of text
            final_text = ""
            try:
                if (
                    final_response.candidates
                    and final_response.candidates[0].content
                    and final_response.candidates[0].content.parts
                ):
                    text_parts = [
                        p.text
                        for p in final_response.candidates[0].content.parts
                        if hasattr(p, "text") and p.text
                    ]
                    final_text = "\n".join(text_parts)
                if not final_text:
                    final_text = final_response.text or ""
            except Exception:
                final_text = ""

            # If still no text (LLM returned only function_call), retry with function results as plain text
            if not final_text.strip():
                logger.warning(
                    "Final response had no text, retrying synthesis with plain context"
                )
                context_parts = []
                for fr in function_responses:
                    func_resp = fr.get("function_response", {})
                    result_text = func_resp.get("response", {}).get("result", "")
                    if result_text:
                        context_parts.append(f"[검색 결과]\n{result_text}")
                context_str = "\n\n".join(context_parts)
                retry_prompt = (
                    f"{context_str}\n\n위 검색 결과를 바탕으로 다음 질문에 답변해주세요:\n{query}"
                    if context_str
                    else query
                )
                retry_response = _get_genai_client().models.generate_content(
                    model=model_name,
                    contents=[{"role": "user", "parts": [{"text": retry_prompt}]}],
                    config=types.GenerateContentConfig(
                        system_instruction=effective_instruction,
                        tool_config=types.ToolConfig(
                            function_calling_config=types.FunctionCallingConfig(
                                mode="NONE"
                            )
                        ),
                        **gen_params,
                    ),
                )
                final_text = (
                    retry_response.text
                    if retry_response.text
                    else "답변을 생성할 수 없습니다. 다시 시도해 주세요."
                )

            return {
                "text": filter_pii(final_text),
                "used_calendar": used_calendar,
                "cited_sources": cited_sources,
            }

        except Exception as e:
            logger.error(f"Error in smart query: {e}")
            raise
