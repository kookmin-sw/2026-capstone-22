from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import shutil
import uuid
import logging
import json
from ..database import get_db
from ..models.user import User
from ..schemas.corpus import (
    CorpusCreate,
    CorpusResponse,
    DocumentResponse,
    CorpusDetailResponse,
    DocumentUploadResponse,
    CorpusDeleteRequest,
    BulkDeleteRequest,
    BulkDeleteResponse,
    CorpusUpdate,
)
from ..utils.dependencies import get_current_admin_user
from ..utils.security import verify_password
from ..services.rag_service import RagService as GeminiService
from ..config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_search_backend(db_session, tenant_id: int = None) -> str:
    """Return 'rag_engine' or 'vertex_ai_search' based on tenant settings"""
    if tenant_id:
        from ..models.tenant import Tenant

        tenant = db_session.query(Tenant).filter(Tenant.id == tenant_id).first()
        if tenant and hasattr(tenant, "search_backend") and tenant.search_backend:
            return tenant.search_backend
    return "rag_engine"


@router.post("/", response_model=CorpusResponse, status_code=status.HTTP_201_CREATED)
async def create_corpus(
    corpus_data: CorpusCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Create a new corpus (Admin only) - Creates in Vertex AI RAG and saves to DB"""
    from ..models.corpus import Corpus
    from ..models.tenant import Tenant

    try:
        # Build Vertex AI display_name with tenant prefix for easier management
        tenant = db.query(Tenant).filter(Tenant.id == current_user.tenant_id).first()
        tenant_prefix = f"[{tenant.slug}] " if tenant else ""
        vertex_display_name = f"{tenant_prefix}{corpus_data.display_name}"

        search_backend = _get_search_backend(db, tenant_id=current_user.tenant_id)

        if search_backend == "vertex_ai_search":
            # ── Vertex AI Search path ──
            from ..services.search_service import SearchService

            tenant_slug = tenant.slug if tenant else f"tenant-{current_user.tenant_id}"
            import re

            safe_name = re.sub(
                r"[^a-z0-9-]", "", corpus_data.display_name.lower().replace(" ", "-")
            )
            data_store_id = f"{tenant_slug}-{safe_name or uuid.uuid4().hex[:8]}"

            result = SearchService.create_data_store(
                data_store_id=data_store_id,
                display_name=vertex_display_name,
                description=corpus_data.description,
            )

            corpus_name_value = result["data_store_name"]
            logger.info(f"Created data store (Vertex AI Search): {corpus_name_value}")
        else:
            # ── RAG Engine path (default) ──
            # Build Weaviate config from platform settings (if configured)
            from ..models.platform_setting import PlatformSetting

            weaviate_endpoint = (
                db.query(PlatformSetting)
                .filter(PlatformSetting.key == "WEAVIATE_HTTP_ENDPOINT")
                .first()
            )
            weaviate_collection = (
                db.query(PlatformSetting)
                .filter(PlatformSetting.key == "WEAVIATE_COLLECTION_NAME")
                .first()
            )
            weaviate_secret = (
                db.query(PlatformSetting)
                .filter(PlatformSetting.key == "WEAVIATE_API_KEY_SECRET")
                .first()
            )

            weaviate_config = None
            if (
                weaviate_endpoint
                and weaviate_endpoint.value
                and weaviate_collection
                and weaviate_collection.value
                and weaviate_secret
                and weaviate_secret.value
            ):
                weaviate_config = {
                    "http_endpoint": weaviate_endpoint.value,
                    "collection_name": weaviate_collection.value,
                    "api_key_secret_version": weaviate_secret.value,
                }
                logger.info(
                    f"Creating corpus with Weaviate backend: {weaviate_endpoint.value}"
                )

            # Create corpus in Vertex AI RAG
            gemini_corpus = GeminiService.create_corpus(
                display_name=vertex_display_name,
                description=corpus_data.description,
                weaviate_config=weaviate_config,
            )

            corpus_name_value = gemini_corpus["corpus_name"]

        # Save to DB immediately
        db_corpus = Corpus(
            corpus_name=corpus_name_value,
            display_name=corpus_data.display_name,
            description=corpus_data.description,
            is_public=corpus_data.is_public,
            created_by=current_user.id,
            tenant_id=current_user.tenant_id,
        )
        db.add(db_corpus)
        db.commit()
        db.refresh(db_corpus)

        logger.info(f"Created corpus and saved to DB: {corpus_name_value}")

        # Create GCS folder placeholder for this corpus
        try:
            from ..services import gcs_service

            if tenant and gcs_service.is_configured(
                tenant_id=current_user.tenant_id, db=db
            ):
                corpus_folder = corpus_data.display_name.replace("/", "_")
                placeholder_path = f"tenants/{tenant.slug}/{corpus_folder}/.keep"
                gcs_client, bucket_name = gcs_service._get_tenant_gcs(
                    current_user.tenant_id, db
                )
                if bucket_name:
                    bucket = gcs_client.bucket(bucket_name)
                    blob = bucket.blob(placeholder_path)
                    blob.upload_from_string("")
                    logger.info(f"Created GCS folder: {bucket_name}/{placeholder_path}")
        except Exception as gcs_err:
            logger.warning(f"Failed to create GCS folder placeholder: {gcs_err}")

        return {
            "id": db_corpus.id,
            "corpus_name": corpus_name_value,
            "display_name": corpus_data.display_name,
            "description": corpus_data.description,
            "is_public": corpus_data.is_public,
            "document_count": 0,
            "created_by": current_user.id,
            "created_at": db_corpus.created_at,
        }
    except Exception as e:
        logger.error(f"Error creating corpus: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating corpus: {str(e)}")


@router.get("/", response_model=List[CorpusResponse])
async def list_corpora(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)
):
    """List all corpora (Admin only) - Uses local DB as single source of truth

    로컬 DB를 조회하여 Corpus 목록과 문서 수를 반환합니다.
    서버 시작 시 자동 동기화로 DB와 Gemini API가 동기화되어 있습니다.

    장점:
    - 응답 속도 <100ms (Gemini API: 1-3초)
    - Rate Limit 없음
    - 검색/필터링 가능
    """
    from sqlalchemy import func
    from ..models.corpus import Corpus, Document

    try:
        # DB에서 Corpus 목록과 문서 수 조회
        results = (
            db.query(Corpus, func.count(Document.id).label("document_count"))
            .filter(Corpus.tenant_id == current_user.tenant_id)
            .outerjoin(Document)
            .group_by(Corpus.id)
            .all()
        )

        from datetime import datetime, timezone

        return [
            CorpusResponse(
                id=corpus.id,
                corpus_name=corpus.corpus_name,
                display_name=corpus.display_name,
                description=corpus.description,
                is_public=corpus.is_public if corpus.is_public is not None else True,
                document_count=doc_count,
                created_by=corpus.created_by,
                created_at=corpus.created_at or datetime.now(timezone.utc),
            )
            for corpus, doc_count in results
        ]
    except Exception as e:
        logger.error(f"Error listing corpora: {e}")
        raise HTTPException(status_code=500, detail=f"Error listing corpora: {str(e)}")


@router.patch("/{corpus_name:path}/settings", response_model=CorpusResponse)
async def update_corpus_settings(
    corpus_name: str,
    update_data: CorpusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Update corpus settings (Admin only) - e.g. is_public toggle"""
    from ..models.corpus import Corpus

    try:
        corpus = (
            db.query(Corpus)
            .filter(
                Corpus.corpus_name == corpus_name,
                Corpus.tenant_id == current_user.tenant_id,
            )
            .first()
        )
        if not corpus:
            raise HTTPException(status_code=404, detail="Corpus not found")

        if update_data.is_public is not None:
            corpus.is_public = update_data.is_public
        if update_data.description is not None:
            corpus.description = update_data.description

        db.commit()
        db.refresh(corpus)

        doc_count = len(corpus.documents) if corpus.documents else 0
        logger.info(
            f"Updated corpus settings: {corpus_name} (is_public={corpus.is_public})"
        )

        return CorpusResponse(
            id=corpus.id,
            corpus_name=corpus.corpus_name,
            display_name=corpus.display_name,
            description=corpus.description,
            is_public=corpus.is_public,
            document_count=doc_count,
            created_by=corpus.created_by,
            created_at=corpus.created_at,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating corpus settings: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating corpus: {str(e)}")


@router.post("/{corpus_name:path}/delete", status_code=status.HTTP_204_NO_CONTENT)
async def delete_corpus(
    corpus_name: str,
    delete_request: CorpusDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Delete a corpus (Admin only) - Uses safe deletion with exponential backoff

    503 에러 발생 시 자동으로 문서를 배치 삭제 후 Corpus 삭제
    Requires password verification for security
    """
    from ..models.corpus import Corpus

    try:
        # Verify password
        if not verify_password(delete_request.password, current_user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="비밀번호가 일치하지 않습니다",
            )

        search_backend = _get_search_backend(db, tenant_id=current_user.tenant_id)

        # 외부 리소스 삭제 (실패해도 DB 삭제는 진행)
        external_error = None
        try:
            if search_backend == "vertex_ai_search":
                # ── Vertex AI Search path ──
                from ..services.search_service import SearchService

                SearchService.delete_data_store(corpus_name)
            else:
                # ── RAG Engine path (default) ──
                GeminiService.delete_corpus_safe(corpus_name, db=db)
        except Exception as ext_err:
            logger.warning(
                f"External resource deletion failed for {corpus_name} (proceeding with DB cleanup): {ext_err}"
            )
            external_error = ext_err

        # GCS 폴더 삭제 (실패해도 무시)
        try:
            from ..models.tenant import Tenant

            tenant = (
                db.query(Tenant).filter(Tenant.id == current_user.tenant_id).first()
            )
            if tenant:
                from ..services import gcs_service

                if gcs_service.is_configured(tenant_id=current_user.tenant_id, db=db):
                    corpus_obj = (
                        db.query(Corpus)
                        .filter(
                            Corpus.corpus_name == corpus_name,
                            Corpus.tenant_id == current_user.tenant_id,
                        )
                        .first()
                    )
                    if corpus_obj:
                        corpus_folder = corpus_obj.display_name.replace("/", "_")
                        gcs_client, bucket_name = gcs_service._get_tenant_gcs(
                            current_user.tenant_id, db
                        )
                        if bucket_name:
                            bucket = gcs_client.bucket(bucket_name)
                            prefix = f"tenants/{tenant.slug}/{corpus_folder}/"
                            blobs = list(bucket.list_blobs(prefix=prefix))
                            for blob in blobs:
                                try:
                                    blob.delete()
                                except Exception:
                                    pass
                            if blobs:
                                logger.info(
                                    f"Deleted {len(blobs)} GCS objects under {prefix}"
                                )
        except Exception as gcs_err:
            logger.warning(
                f"GCS folder cleanup failed for corpus {corpus_name}: {gcs_err}"
            )

        # DB 레코드 삭제 (반드시 실행)
        corpus = (
            db.query(Corpus)
            .filter(
                Corpus.corpus_name == corpus_name,
                Corpus.tenant_id == current_user.tenant_id,
            )
            .first()
        )
        if corpus:
            # 관련 문서 레코드도 cascade 또는 직접 삭제
            from ..models.corpus import Document

            db.query(Document).filter(Document.corpus_id == corpus.id).delete(
                synchronize_session=False
            )
            db.delete(corpus)
            db.commit()
            logger.info(f"Deleted corpus and documents from DB: {corpus_name}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting corpus: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting corpus: {str(e)}")


@router.post("/{corpus_name:path}/documents", response_model=DocumentUploadResponse)
async def upload_document(
    corpus_name: str,
    file: UploadFile = File(...),
    custom_metadata: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Upload a document to corpus (Admin only) - Uses Vertex AI RAG

    Args:
        corpus_name: Target file search store name
        file: File to upload
        custom_metadata: Optional JSON string of metadata list, e.g.:
            '[{"key": "category", "string_value": "자료"}, {"key": "year", "numeric_value": 2024}]'
    """
    # Save file temporarily with UUID filename to avoid encoding issues
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    # Get file extension
    file_extension = os.path.splitext(file.filename)[1] if file.filename else ""

    # Generate safe filename using UUID
    safe_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = os.path.join(settings.UPLOAD_DIR, safe_filename)

    # Parse custom_metadata JSON if provided
    metadata_list = None
    if custom_metadata:
        try:
            metadata_list = json.loads(custom_metadata)
            logger.info(f"Received custom_metadata: {metadata_list}")
        except json.JSONDecodeError as e:
            raise HTTPException(
                status_code=400, detail=f"Invalid custom_metadata JSON: {str(e)}"
            )

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        file_size = os.path.getsize(file_path)

        # Clean MIME type (remove charset and other parameters for RAG import)
        raw_mime = file.content_type or "application/octet-stream"
        # Extract just the type/subtype part for RAG import
        mime_type = raw_mime.split(";")[0].strip()

        # Validate MIME type format
        if "/" not in mime_type:
            mime_type = "application/octet-stream"

        # For GCS upload, preserve charset for text files to avoid encoding issues
        gcs_content_type = raw_mime if mime_type.startswith("text/") else mime_type

        logger.info(
            f"Upload MIME type: {raw_mime} -> {mime_type} (GCS: {gcs_content_type})"
        )

        import time as _time

        _upload_start = _time.time()

        # Upload to GCS first (required for Vertex AI RAG import)
        gcs_path = None
        gcs_uri = None
        from ..services import gcs_service
        from ..models.tenant import Tenant

        if not gcs_service.is_configured(tenant_id=current_user.tenant_id, db=db):
            raise HTTPException(
                status_code=400,
                detail="GCS 버킷이 설정되지 않았습니다. 문서 업로드에는 GCS 설정이 필요합니다.",
            )

        try:
            tenant = (
                db.query(Tenant).filter(Tenant.id == current_user.tenant_id).first()
            )
            tenant_slug = tenant.slug if tenant else f"tenant-{current_user.tenant_id}"
            # Get corpus display_name for folder structure
            from ..models.corpus import Corpus as CorpusModel

            db_corpus = (
                db.query(CorpusModel)
                .filter(CorpusModel.corpus_name == corpus_name)
                .first()
            )
            raw_folder = (
                db_corpus.display_name if db_corpus else corpus_name.split("/")[-1]
            )
            corpus_folder = raw_folder.replace("/", "_")
            gcs_object_path = f"tenants/{tenant_slug}/{corpus_folder}/{safe_filename}"
            gcs_path = gcs_service.upload_file(
                file_path,
                gcs_object_path,
                content_type=gcs_content_type,
                tenant_id=current_user.tenant_id,
                db=db,
            )
            bucket_name = gcs_service.get_bucket_name(
                tenant_id=current_user.tenant_id, db=db
            )
            gcs_uri = f"gs://{bucket_name}/{gcs_path}"
            _gcs_elapsed = _time.time() - _upload_start
            logger.info(f"Uploaded to GCS: {gcs_uri} ({_gcs_elapsed:.1f}s)")
        except HTTPException:
            raise
        except Exception as gcs_err:
            raise HTTPException(
                status_code=500, detail=f"GCS 업로드 실패: {str(gcs_err)}"
            )

        search_backend = _get_search_backend(db, tenant_id=current_user.tenant_id)

        if search_backend == "vertex_ai_search":
            # ── Vertex AI Search path ──
            from ..services.search_service import SearchService

            doc_id = safe_filename.rsplit(".", 1)[0]  # use UUID part as document_id
            _import_start = _time.time()
            import_result = SearchService.import_document_from_gcs(
                data_store_name=corpus_name,
                gcs_uri=gcs_uri,
                document_id=doc_id,
            )

            # Save to DB
            from ..models.corpus import Corpus as CorpusModel2, Document

            corpus_record = (
                db.query(CorpusModel2)
                .filter(CorpusModel2.corpus_name == corpus_name)
                .first()
            )
            if corpus_record:
                doc_name = f"{corpus_name}/branches/default_branch/documents/{doc_id}"
                existing = (
                    db.query(Document)
                    .filter(Document.document_name == doc_name)
                    .first()
                )
                if not existing:
                    new_doc = Document(
                        corpus_id=corpus_record.id,
                        document_name=doc_name,
                        display_name=file.filename,
                        file_size=file_size,
                        mime_type=mime_type,
                        gcs_path=gcs_path,
                        tenant_id=current_user.tenant_id,
                    )
                    db.add(new_doc)
                    db.commit()
                    _import_elapsed = _time.time() - _import_start
                    _total_elapsed = _time.time() - _upload_start
                    logger.info(
                        f"Saved document to DB (Vertex AI Search): {file.filename} -> {doc_name} (import: {_import_elapsed:.1f}s, total: {_total_elapsed:.1f}s)"
                    )

            # Record indexing usage (estimated from file size)
            try:
                from ..models.usage import UsageRecord
                from ..utils.pricing import estimate_embedding_cost, AVG_TOKENS_PER_BYTE

                estimated_tokens = int(file_size * AVG_TOKENS_PER_BYTE)
                indexing_cost = estimate_embedding_cost(file_size)
                record = UsageRecord(
                    tenant_id=current_user.tenant_id,
                    user_id=current_user.id,
                    call_type="indexing",
                    model_name="vertex-ai-search",
                    prompt_token_count=estimated_tokens,
                    candidates_token_count=0,
                    total_token_count=estimated_tokens,
                    estimated_cost_usd=indexing_cost,
                )
                db.add(record)
                db.commit()
            except Exception as usage_err:
                logger.warning(f"Failed to record indexing usage: {usage_err}")

            _total_elapsed = _time.time() - _upload_start
            logger.info(
                f"Upload response sent (Vertex AI Search): {file.filename} ({_total_elapsed:.1f}s)"
            )

            return {
                "operation_name": f"vertex-ai-search-import-{doc_id}",
                "display_name": file.filename,
                "status": "indexing",
                "message": "문서가 업로드되었습니다. 인덱싱이 진행 중이며, 챗봇에 반영되기까지 수 분이 소요될 수 있습니다.",
                "gcs_path": gcs_path,
            }
        else:
            # ── RAG Engine path (default) ──
            upload_result = GeminiService.upload_document(
                corpus_name=corpus_name,
                file_path=file_path,
                display_name=file.filename,  # Keep original filename for display
                mime_type=mime_type,
                custom_metadata=metadata_list,
                gcs_uri=gcs_uri,
            )

            # Save to DB immediately if document info is available (GCS import is synchronous)
            upload_result["gcs_path"] = gcs_path
            if upload_result.get("done") and upload_result.get("document"):
                from ..models.corpus import Corpus as CorpusModel2, Document

                doc_info = upload_result["document"]
                doc_name = doc_info.get("name")
                if doc_name:
                    existing = (
                        db.query(Document)
                        .filter(Document.document_name == doc_name)
                        .first()
                    )
                    if not existing:
                        corpus_record = (
                            db.query(CorpusModel2)
                            .filter(CorpusModel2.corpus_name == corpus_name)
                            .first()
                        )
                        if corpus_record:
                            new_doc = Document(
                                corpus_id=corpus_record.id,
                                document_name=doc_name,
                                display_name=file.filename,
                                file_size=file_size,
                                mime_type=mime_type,
                                gcs_path=gcs_path,
                                tenant_id=current_user.tenant_id,
                            )
                            db.add(new_doc)
                            db.commit()
                            logger.info(
                                f"Saved document to DB: {file.filename} -> {doc_name}"
                            )

            # Record embedding usage (estimated from file size)
            try:
                from ..models.usage import UsageRecord
                from ..utils.pricing import estimate_embedding_cost, AVG_TOKENS_PER_BYTE

                estimated_tokens = int(file_size * AVG_TOKENS_PER_BYTE)
                embedding_cost = estimate_embedding_cost(file_size)
                record = UsageRecord(
                    tenant_id=current_user.tenant_id,
                    user_id=current_user.id,
                    call_type="embedding",
                    model_name="text-embedding-005",
                    prompt_token_count=estimated_tokens,
                    candidates_token_count=0,
                    total_token_count=estimated_tokens,
                    estimated_cost_usd=embedding_cost,
                )
                db.add(record)
                db.commit()
            except Exception as usage_err:
                logger.warning(f"Failed to record embedding usage: {usage_err}")

            return {
                "operation_name": upload_result["operation_name"],
                "display_name": upload_result["display_name"],
                "status": upload_result["status"],
                "message": "Upload completed",
                "gcs_path": gcs_path,
            }
    except Exception as e:
        logger.error(f"Error uploading document: {e}")
        raise HTTPException(
            status_code=500, detail=f"Error uploading to Gemini: {str(e)}"
        )
    finally:
        # Clean up temporary file
        if os.path.exists(file_path):
            os.remove(file_path)


@router.get("/{corpus_name:path}/operations/{operation_id:path}")
async def check_operation_status(
    corpus_name: str,
    operation_id: str,
    display_name: Optional[str] = None,
    gcs_path: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Check the status of an upload operation (Admin only)

    업로드가 완료되면 (done=True) 자동으로 로컬 DB에 문서 정보를 저장합니다.

    Args:
        display_name: 원본 파일명 (Gemini가 displayName을 반환하지 않을 때 사용)
    """
    from ..models.corpus import Corpus, Document

    try:
        # Construct full operation name
        operation_name = f"{corpus_name}/upload/operations/{operation_id}"
        status_data = GeminiService.check_operation_status(operation_name)

        # 업로드 완료 시 DB에 문서 저장
        if status_data.get("done") and status_data.get("document"):
            doc_info = status_data["document"]
            doc_name = doc_info.get("name")

            if doc_name:
                # 이미 DB에 있는지 확인
                existing = (
                    db.query(Document)
                    .filter(Document.document_name == doc_name)
                    .first()
                )

                if not existing:
                    # Corpus 찾기 또는 생성
                    corpus = (
                        db.query(Corpus)
                        .filter(Corpus.corpus_name == corpus_name)
                        .first()
                    )

                    if not corpus:
                        # Corpus가 DB에 없으면 생성
                        corpus = Corpus(
                            corpus_name=corpus_name,
                            display_name=corpus_name.split("/")[-1],
                            created_by=current_user.id,
                            tenant_id=current_user.tenant_id,
                        )
                        db.add(corpus)
                        db.flush()

                    # displayName: Gemini 응답 우선, 없으면 클라이언트 전달값, 없으면 doc_name에서 추출
                    final_display_name = (
                        doc_info.get("displayName")
                        or display_name
                        or doc_name.split("/")[-1]
                    )

                    # 문서 저장
                    new_doc = Document(
                        corpus_id=corpus.id,
                        document_name=doc_name,
                        display_name=final_display_name,
                        file_size=doc_info.get("sizeBytes"),
                        mime_type=doc_info.get("mimeType"),
                        gcs_path=gcs_path,
                        tenant_id=current_user.tenant_id,
                    )
                    db.add(new_doc)
                    db.commit()
                    logger.info(
                        f"Saved document to DB: {final_display_name} -> {doc_name}"
                    )

        return status_data
    except Exception as e:
        logger.error(f"Error checking operation status: {e}")
        raise HTTPException(
            status_code=500, detail=f"Error checking operation: {str(e)}"
        )


@router.delete(
    "/{corpus_name:path}/documents/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_document(
    corpus_name: str,
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Delete a document from Vertex AI RAG (Admin only)

    Also removes from local DB for consistency.
    """
    from ..models.corpus import Document

    try:
        search_backend = _get_search_backend(db, tenant_id=current_user.tenant_id)

        if search_backend == "vertex_ai_search":
            full_document_name = (
                f"{corpus_name}/branches/default_branch/documents/{document_id}"
            )
        else:
            full_document_name = f"{corpus_name}/ragFiles/{document_id}"

        # 외부 리소스 삭제 (실패해도 DB 삭제는 진행)
        try:
            if search_backend == "vertex_ai_search":
                from ..services.search_service import SearchService

                SearchService.delete_document(corpus_name, document_id)
            else:
                GeminiService.delete_document(full_document_name)
        except Exception as ext_err:
            logger.warning(
                f"External resource deletion failed for {full_document_name} (proceeding with DB cleanup): {ext_err}"
            )

        # Delete from local DB (documents table) — 반드시 실행
        db_doc = (
            db.query(Document)
            .filter(Document.document_name == full_document_name)
            .first()
        )
        if db_doc:
            # Delete from GCS if path exists (실패해도 DB 삭제는 진행)
            if db_doc.gcs_path:
                try:
                    from ..services import gcs_service

                    if gcs_service.is_configured(
                        tenant_id=current_user.tenant_id, db=db
                    ):
                        gcs_service.delete_file(
                            db_doc.gcs_path, tenant_id=current_user.tenant_id, db=db
                        )
                except Exception as gcs_err:
                    logger.warning(
                        f"GCS delete failed for {full_document_name}: {gcs_err}"
                    )
            db.delete(db_doc)
            logger.info(f"Deleted document from DB: {full_document_name}")

        db.commit()

    except Exception as e:
        logger.error(f"Error deleting document: {e}")
        raise HTTPException(
            status_code=500, detail=f"Error deleting document: {str(e)}"
        )


@router.get("/download")
async def download_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Generate a signed URL for downloading the original document from GCS"""
    from ..models.corpus import Document

    doc = (
        db.query(Document)
        .filter(
            Document.id == document_id, Document.tenant_id == current_user.tenant_id
        )
        .first()
    )

    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다")

    if not doc.gcs_path:
        raise HTTPException(status_code=404, detail="원본 파일이 GCS에 없습니다")

    from ..services import gcs_service

    # View URL (opens in browser)
    view_url = gcs_service.generate_signed_url(
        doc.gcs_path, expiration_minutes=30, tenant_id=current_user.tenant_id, db=db
    )

    # Download URL (forces download)
    download_url = gcs_service.generate_signed_url(
        doc.gcs_path,
        expiration_minutes=30,
        tenant_id=current_user.tenant_id,
        db=db,
        download_filename=doc.display_name,
    )

    if not view_url or not download_url:
        raise HTTPException(status_code=500, detail="URL 생성에 실패했습니다")

    return {
        "view_url": view_url,
        "download_url": download_url,
        "display_name": doc.display_name,
    }


@router.get("/{corpus_name:path}/documents/names")
async def get_document_names(
    corpus_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Corpus의 모든 문서 display_name 목록 조회 (DB 기반, 빠름)

    Gemini API 페이지네이션 대신 로컬 DB에서 즉시 조회.
    업로드 스크립트의 중복 체크에 사용.

    Returns:
        {"names": ["file1.txt", "file2.pdf", ...], "count": 1234}
    """
    from ..models.corpus import Corpus, Document

    try:
        # DB에서 해당 corpus의 모든 document display_name 조회
        corpus = (
            db.query(Corpus)
            .filter(
                Corpus.corpus_name == corpus_name,
                Corpus.tenant_id == current_user.tenant_id,
            )
            .first()
        )

        if not corpus:
            # corpus가 DB에 없으면 빈 목록 반환
            logger.warning(f"Corpus not found in DB: {corpus_name}")
            return {"names": [], "count": 0}

        # display_name만 조회 (빠름)
        names = (
            db.query(Document.display_name)
            .filter(Document.corpus_id == corpus.id)
            .all()
        )

        name_list = [n[0] for n in names if n[0]]

        logger.info(
            f"Retrieved {len(name_list)} document names from DB for {corpus_name}"
        )
        return {"names": name_list, "count": len(name_list)}

    except Exception as e:
        logger.error(f"Error getting document names: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get("/{corpus_name:path}", response_model=CorpusDetailResponse)
async def get_corpus(
    corpus_name: str,
    page: int = 1,
    page_size: int = 10,
    search: Optional[str] = None,
    mime_type: Optional[str] = None,
    sort_by: str = "uploaded_at",
    sort_order: str = "desc",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Get corpus details with paginated, searchable documents (Admin only) - Uses local DB

    로컬 DB를 조회하여 Corpus 상세 정보와 문서 목록을 반환합니다.

    Args:
        corpus_name: Name of the file search store
        page: Page number (1-indexed, default 1)
        page_size: Number of documents per page (default 10)
        search: Search query for display_name (optional, case-insensitive)
        mime_type: Filter by MIME type (optional)
        sort_by: Sort field (uploaded_at, display_name, file_size) - default uploaded_at
        sort_order: Sort order (asc, desc) - default desc

    장점:
    - 응답 속도 <200ms (20,000개 문서에서도 빠름)
    - 파일명 검색 (ILIKE)
    - MIME 타입 필터링
    - 정렬 기능
    """
    import unicodedata
    from ..models.corpus import Corpus, Document

    try:
        # Corpus 조회
        corpus = (
            db.query(Corpus)
            .filter(
                Corpus.corpus_name == corpus_name,
                Corpus.tenant_id == current_user.tenant_id,
            )
            .first()
        )
        if not corpus:
            raise HTTPException(status_code=404, detail="Corpus not found")

        # 문서 쿼리 시작
        query = db.query(Document).filter(Document.corpus_id == corpus.id)

        # 검색 필터 (파일명) - 한글 유니코드 정규화 (NFC/NFD 모두 지원)
        if search:
            # macOS는 NFD, 대부분의 시스템은 NFC를 사용하므로 둘 다 검색
            search_nfc = unicodedata.normalize("NFC", search)
            search_nfd = unicodedata.normalize("NFD", search)

            # NFC와 NFD가 같으면 하나만, 다르면 OR 조건
            if search_nfc == search_nfd:
                query = query.filter(Document.display_name.ilike(f"%{search_nfc}%"))
            else:
                from sqlalchemy import or_

                query = query.filter(
                    or_(
                        Document.display_name.ilike(f"%{search_nfc}%"),
                        Document.display_name.ilike(f"%{search_nfd}%"),
                    )
                )

        # MIME 타입 필터
        if mime_type:
            query = query.filter(Document.mime_type == mime_type)

        # 전체 개수 (필터 적용 후)
        total_count = query.count()

        # 정렬
        valid_sort_fields = ["uploaded_at", "display_name", "file_size"]
        if sort_by not in valid_sort_fields:
            sort_by = "uploaded_at"

        sort_column = getattr(Document, sort_by, Document.uploaded_at)
        if sort_order.lower() == "desc":
            query = query.order_by(sort_column.desc())
        else:
            query = query.order_by(sort_column.asc())

        # 페이지네이션
        offset = (page - 1) * page_size
        documents = query.offset(offset).limit(page_size).all()

        # 다음 페이지 존재 여부
        has_next_page = (offset + page_size) < total_count
        total_pages = (total_count + page_size - 1) // page_size if page_size > 0 else 1

        return CorpusDetailResponse(
            id=corpus.id,
            corpus_name=corpus.corpus_name,
            display_name=corpus.display_name,
            description=corpus.description,
            is_public=corpus.is_public if corpus.is_public is not None else True,
            document_count=total_count,
            created_by=corpus.created_by,
            created_at=corpus.created_at,
            documents=[
                DocumentResponse(
                    id=doc.id,
                    document_name=doc.document_name,
                    display_name=doc.display_name,
                    corpus_id=doc.corpus_id,
                    file_path=doc.file_path,
                    file_size=doc.file_size,
                    mime_type=doc.mime_type,
                    uploaded_at=doc.uploaded_at,
                )
                for doc in documents
            ],
            total_count=total_count,
            has_next_page=has_next_page,
            next_page_token=str(page + 1) if has_next_page else None,  # 하위 호환성
            current_page=page,
            total_pages=total_pages,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting corpus: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting corpus: {str(e)}")


@router.post(
    "/{corpus_name:path}/documents/bulk-delete", response_model=BulkDeleteResponse
)
async def bulk_delete_documents(
    corpus_name: str,
    request: BulkDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """일괄 삭제 (Admin only) - 로컬 DB를 사용한 O(1) 조회

    display_name 목록으로 문서를 빠르게 삭제합니다.
    Gemini API 페이지네이션 없이 로컬 DB에서 바로 조회하여 삭제.

    Args:
        corpus_name: File search store name
        request: 삭제할 display_names 목록과 비밀번호

    Returns:
        BulkDeleteResponse: 삭제 결과 (성공/실패 목록)
    """
    try:
        # Verify password
        if not verify_password(request.password, current_user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="비밀번호가 일치하지 않습니다",
            )

        search_backend = _get_search_backend(db, tenant_id=current_user.tenant_id)

        if search_backend == "vertex_ai_search":
            # ── Vertex AI Search: delete individually via SearchService ──
            from ..services.search_service import SearchService
            from ..models.corpus import Corpus as CorpusModel, Document

            deleted = []
            not_found = []
            errors = []

            corpus_record = (
                db.query(CorpusModel)
                .filter(CorpusModel.corpus_name == corpus_name)
                .first()
            )
            for display_name in request.display_names:
                if not corpus_record:
                    not_found.append(display_name)
                    continue
                doc = (
                    db.query(Document)
                    .filter(
                        Document.corpus_id == corpus_record.id,
                        Document.display_name == display_name,
                    )
                    .first()
                )
                if not doc:
                    not_found.append(display_name)
                    continue
                try:
                    # Extract document_id from document_name
                    doc_id = doc.document_name.split("/")[-1]

                    # Vertex AI Search 삭제 (실패해도 DB 삭제 진행)
                    try:
                        SearchService.delete_document(corpus_name, doc_id)
                    except Exception as search_err:
                        logger.warning(
                            f"Vertex AI Search delete failed for {display_name} (continuing): {search_err}"
                        )

                    # GCS 삭제 (실패해도 DB 삭제 진행)
                    if doc.gcs_path:
                        try:
                            from ..services import gcs_service

                            if gcs_service.is_configured(
                                tenant_id=current_user.tenant_id, db=db
                            ):
                                gcs_service.delete_file(
                                    doc.gcs_path,
                                    tenant_id=current_user.tenant_id,
                                    db=db,
                                )
                        except Exception as gcs_err:
                            logger.warning(
                                f"GCS delete failed for {display_name}: {gcs_err}"
                            )

                    # DB 삭제 (반드시 실행)
                    db.delete(doc)
                    deleted.append(display_name)
                except Exception as del_err:
                    errors.append(f"{display_name}: {str(del_err)}")

            db.commit()
            result = {"deleted": deleted, "not_found": not_found, "errors": errors}
        else:
            # ── RAG Engine path (default) ──
            # Bulk delete using local DB lookup
            result = GeminiService.bulk_delete_documents(
                corpus_name=corpus_name, display_names=request.display_names, db=db
            )

        return BulkDeleteResponse(
            deleted=result["deleted"],
            not_found=result["not_found"],
            errors=result["errors"],
            total_requested=len(request.display_names),
            total_deleted=len(result["deleted"]),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in bulk delete: {e}")
        raise HTTPException(status_code=500, detail=f"Error in bulk delete: {str(e)}")
