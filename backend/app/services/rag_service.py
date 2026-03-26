"""Vertex AI RAG corpus/document CRUD operations"""
from typing import List, Optional, Dict, Any
import logging
import time
from sqlalchemy.orm import Session
from vertexai import rag
from ..utils.retry import CORPUS_DELETION_RETRY
from .gemini_client import _init_vertex_ai

logger = logging.getLogger(__name__)


def _is_not_found_error(e: Exception) -> bool:
    """Check if an exception indicates a resource was already deleted / not found"""
    error_str = str(e)
    return ("404" in error_str
            or "not found" in error_str.lower()
            or "NOT_FOUND" in error_str)


class RagService:
    """Service for managing RAG corpora and documents in Vertex AI"""

    @staticmethod
    def create_corpus(display_name: str, description: Optional[str] = None, weaviate_config: Optional[Dict] = None) -> dict:
        """Create a new RAG corpus in Vertex AI

        Args:
            display_name: Corpus display name
            description: Corpus description
            weaviate_config: Optional Weaviate config dict with keys:
                - http_endpoint: Weaviate HTTPS endpoint
                - collection_name: Weaviate collection name
                - api_key_secret_version: Secret Manager resource name
        """
        try:
            _init_vertex_ai()

            if weaviate_config:
                # Use REST API for Weaviate (SDK has a bug with Weaviate backend)
                corpus_name = RagService._create_corpus_rest(
                    display_name=display_name,
                    description=description,
                    weaviate_config=weaviate_config,
                )
            else:
                embedding_model_config = rag.RagEmbeddingModelConfig(
                    vertex_prediction_endpoint=rag.VertexPredictionEndpoint(
                        publisher_model="publishers/google/models/text-embedding-005"
                    )
                )
                backend_config = rag.RagVectorDbConfig(
                    rag_embedding_model_config=embedding_model_config,
                )
                rag_corpus = rag.create_corpus(
                    display_name=display_name,
                    description=description or "",
                    backend_config=backend_config,
                )
                corpus_name = rag_corpus.name

            logger.info(f"Created RAG corpus: {corpus_name}")
            return {
                "corpus_name": corpus_name,
                "display_name": display_name,
                "description": description,
            }
        except Exception as e:
            logger.error(f"Error creating RAG corpus: {e}")
            raise

    @staticmethod
    def _create_corpus_rest(display_name: str, description: Optional[str], weaviate_config: Dict) -> str:
        """Create a Weaviate-backed RAG corpus via REST API (workaround for SDK bug)"""
        import google.auth
        import google.auth.transport.requests
        import requests as http_requests

        from .gemini_client import _get_vertex_project, _get_vertex_location

        project = _get_vertex_project()
        location = _get_vertex_location()

        credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        auth_req = google.auth.transport.requests.Request()
        credentials.refresh(auth_req)

        url = f"https://{location}-aiplatform.googleapis.com/v1beta1/projects/{project}/locations/{location}/ragCorpora"
        body = {
            "display_name": display_name,
            "description": description or "",
            "rag_embedding_model_config": {
                "vertex_prediction_endpoint": {
                    "endpoint": f"projects/{project}/locations/{location}/publishers/google/models/text-multilingual-embedding-002"
                }
            },
            "vector_db_config": {
                "weaviate": {
                    "http_endpoint": weaviate_config["http_endpoint"],
                    "collection_name": weaviate_config["collection_name"],
                },
                "api_auth": {
                    "api_key_config": {
                        "api_key_secret_version": weaviate_config["api_key_secret_version"]
                    }
                }
            }
        }

        resp = http_requests.post(url, headers={
            "Authorization": f"Bearer {credentials.token}",
            "Content-Type": "application/json",
        }, json=body, timeout=60)

        if resp.status_code != 200:
            raise RuntimeError(f"Failed to create Weaviate corpus: {resp.status_code} {resp.text}")

        operation = resp.json()
        operation_name = operation.get("name")

        # Poll for completion
        for _ in range(30):
            time.sleep(2)
            op_resp = http_requests.get(
                f"https://{location}-aiplatform.googleapis.com/v1beta1/{operation_name}",
                headers={"Authorization": f"Bearer {credentials.token}"},
                timeout=30,
            )
            op_data = op_resp.json()
            if op_data.get("done"):
                if "error" in op_data:
                    raise RuntimeError(f"Corpus creation failed: {op_data['error']}")
                return op_data["response"]["name"]

        raise RuntimeError("Corpus creation timed out")

    @staticmethod
    def delete_corpus(corpus_name: str):
        """Delete a RAG corpus in Vertex AI.

        If the corpus is already deleted (404/NOT_FOUND), logs a warning and returns normally.
        """
        try:
            _init_vertex_ai()
            logger.info(f"Deleting RAG corpus: {corpus_name}")
            rag.delete_corpus(name=corpus_name)
            logger.info(f"Successfully deleted RAG corpus: {corpus_name}")
        except Exception as e:
            if _is_not_found_error(e):
                logger.warning(f"RAG corpus already deleted (not found): {corpus_name}")
                return
            logger.error(f"Error deleting RAG corpus: {e}")
            raise

    @staticmethod
    def upload_document(corpus_name: str, file_path: str, display_name: str, mime_type: str, custom_metadata: list = None, gcs_uri: Optional[str] = None) -> dict:
        """Upload a document to a RAG corpus via GCS URI or direct upload

        Args:
            corpus_name: RAG corpus resource name
            file_path: Local file path (used as fallback display info)
            display_name: Display name for the document
            mime_type: MIME type of the file
            custom_metadata: Optional metadata (not used in Vertex AI RAG, kept for compat)
            gcs_uri: GCS URI to import from (e.g., "gs://bucket/path/file.pdf")
        """
        try:
            _init_vertex_ai()
            logger.info(f"Importing file to RAG corpus: {display_name}")

            if gcs_uri:
                # Import from GCS (preferred)
                response = rag.import_files(
                    corpus_name,
                    [gcs_uri],
                    transformation_config=rag.TransformationConfig(
                        chunking_config=rag.ChunkingConfig(
                            chunk_size=512,
                            chunk_overlap=100,
                        ),
                    ),
                    max_embedding_requests_per_min=900,
                )
                logger.info(f"Import completed for: {display_name}")

                # Find the imported file in corpus to get its resource name
                doc_info = None
                try:
                    files = list(rag.list_files(corpus_name=corpus_name))
                    # Match by display_name or use the last file
                    for f in files:
                        if getattr(f, 'display_name', '') == display_name:
                            doc_info = {
                                "name": f.name,
                                "displayName": getattr(f, 'display_name', display_name),
                            }
                            break
                    if not doc_info and files:
                        f = files[-1]
                        doc_info = {
                            "name": f.name,
                            "displayName": getattr(f, 'display_name', display_name),
                        }
                    logger.info(f"Retrieved imported file info: {doc_info}")
                except Exception as e:
                    logger.warning(f"Could not retrieve imported file info: {e}")

                return {
                    "operation_name": f"import-{display_name}",
                    "display_name": display_name,
                    "status": "done",
                    "done": True,
                    "document": doc_info,
                }
            else:
                # Upload local file directly
                rag_file = rag.upload_file(
                    corpus_name=corpus_name,
                    path=file_path,
                    display_name=display_name,
                    transformation_config=rag.TransformationConfig(
                        chunking_config=rag.ChunkingConfig(
                            chunk_size=512,
                            chunk_overlap=100,
                        ),
                    ),
                )
                logger.info(f"Upload completed for: {display_name}, rag_file: {rag_file.name}")

                return {
                    "operation_name": f"upload-{display_name}",
                    "display_name": display_name,
                    "status": "done",
                    "done": True,
                    "document": {
                        "name": rag_file.name,
                        "displayName": display_name,
                    }
                }
        except Exception as e:
            logger.error(f"Error uploading {display_name} to RAG corpus: {e}")
            raise

    @staticmethod
    def check_operation_status(operation_name: str) -> dict:
        """Check operation status — Vertex AI RAG import_files is synchronous,
        so this returns done=True immediately for backward compatibility."""
        return {
            "operation_name": operation_name,
            "done": True,
            "error": None,
            "document": None,
        }

    @staticmethod
    def delete_document(document_name: str):
        """Delete a RAG file from Vertex AI.

        If the file is already deleted (404/NOT_FOUND), logs a warning and returns normally.
        """
        try:
            _init_vertex_ai()
            logger.info(f"Deleting RAG file: {document_name}")
            rag.delete_file(name=document_name)
            logger.info(f"Successfully deleted RAG file: {document_name}")
        except Exception as e:
            if _is_not_found_error(e):
                logger.warning(f"RAG file already deleted (not found): {document_name}")
                return
            logger.error(f"Error deleting document after retries: {e}")
            raise

    @staticmethod
    def bulk_delete_documents(corpus_name: str, display_names: List[str], db: Session) -> Dict[str, Any]:
        """로컬 DB를 사용한 일괄 삭제

        Args:
            corpus_name: File search store name
            display_names: 삭제할 파일명 목록
            db: SQLAlchemy 세션
        Returns:
            {
                "deleted": ["file1.pdf", "file2.pdf"],
                "not_found": ["file3.pdf"],
                "errors": [{"name": "file4.pdf", "error": "..."}]
            }
        """
        from ..models.corpus import Document, Corpus

        result = {
            "deleted": [],
            "not_found": [],
            "errors": []
        }

        for display_name in display_names:
            try:
                # 로컬 DB에서 조회
                doc = db.query(Document).join(Corpus).filter(
                    Corpus.corpus_name == corpus_name,
                    Document.display_name == display_name
                ).first()

                if not doc:
                    result["not_found"].append(display_name)
                    continue

                # Vertex AI RAG에서 삭제 (실패해도 DB 삭제는 진행)
                try:
                    RagService.delete_document(doc.document_name)
                except Exception as rag_err:
                    logger.warning(f"RAG delete failed for {display_name} (continuing with DB cleanup): {rag_err}")

                # GCS에서 삭제 (실패해도 DB 삭제는 진행)
                if doc.gcs_path:
                    try:
                        from ..services import gcs_service
                        if gcs_service.is_configured(tenant_id=doc.tenant_id, db=db):
                            gcs_service.delete_file(doc.gcs_path, tenant_id=doc.tenant_id, db=db)
                    except Exception as gcs_err:
                        logger.warning(f"GCS delete failed for {display_name}: {gcs_err}")

                # 로컬 DB에서 삭제 (반드시 실행)
                db.delete(doc)
                result["deleted"].append(display_name)

            except Exception as e:
                result["errors"].append({
                    "name": display_name,
                    "error": str(e)
                })
                logger.error(f"Error bulk deleting {display_name}: {e}")

        # 모든 삭제 완료 후 커밋
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"Error committing bulk delete: {e}")
            raise

        logger.info(
            f"Bulk delete result: {len(result['deleted'])} deleted, "
            f"{len(result['not_found'])} not found, {len(result['errors'])} errors"
        )
        return result

    @staticmethod
    def _batch_delete_all_documents(corpus_name: str, batch_size: int = 20, db: Session = None) -> int:
        """Corpus의 모든 문서를 배치로 삭제"""
        deleted_count = 0

        logger.info(f"Starting batch deletion of all documents in {corpus_name}")

        try:
            _init_vertex_ai()
            files = list(rag.list_files(corpus_name=corpus_name))

            for f in files:
                try:
                    rag.delete_file(name=f.name)
                    deleted_count += 1
                except Exception as e:
                    if _is_not_found_error(e):
                        logger.warning(f"File already deleted (not found): {f.name}")
                        deleted_count += 1
                    else:
                        logger.error(f"Failed to delete file {f.name}: {e}")

                # 로컬 DB에서도 삭제 (RAG 삭제 성공/실패와 무관하게)
                if db:
                    from ..models.corpus import Document
                    db_doc = db.query(Document).filter(
                        Document.document_name == f.name
                    ).first()
                    if db_doc:
                        db.delete(db_doc)

                # Rate limiting 방지
                if deleted_count % batch_size == 0:
                    time.sleep(0.5)

        except Exception as e:
            if _is_not_found_error(e):
                logger.warning(f"Corpus already deleted, skipping file listing: {corpus_name}")
            else:
                logger.error(f"Error listing files for batch deletion: {e}")

        if db:
            try:
                db.commit()
            except Exception as e:
                db.rollback()
                logger.error(f"Error committing batch delete: {e}")

        logger.info(f"Batch deleted {deleted_count} documents from {corpus_name}")
        return deleted_count

    @staticmethod
    def delete_corpus_safe(corpus_name: str, db: Session = None, batch_size: int = 20):
        """503 에러 대응: 문서 먼저 배치 삭제 후 Corpus 삭제.
        404/NOT_FOUND인 경우 이미 삭제된 것으로 간주하고 DB 정리만 수행."""
        try:
            logger.info(f"Attempting direct deletion of corpus: {corpus_name}")
            RagService.delete_corpus(corpus_name)
            logger.info(f"Successfully deleted corpus: {corpus_name}")

        except Exception as e:
            error_str = str(e)
            if _is_not_found_error(e):
                logger.warning(f"Corpus already deleted (not found), proceeding with DB cleanup: {corpus_name}")
            elif "503" in error_str or "Service Unavailable" in error_str:
                logger.warning(
                    f"Direct deletion failed with 503, falling back to batch deletion: {corpus_name}"
                )

                # 문서 먼저 배치 삭제
                deleted_count = RagService._batch_delete_all_documents(
                    corpus_name, batch_size, db
                )
                logger.info(f"Batch deleted {deleted_count} documents")

                # 빈 Corpus 삭제 재시도
                try:
                    @CORPUS_DELETION_RETRY
                    def _delete_empty_corpus():
                        _init_vertex_ai()
                        rag.delete_corpus(name=corpus_name)

                    _delete_empty_corpus()
                    logger.info(f"Successfully deleted empty corpus: {corpus_name}")
                except Exception as retry_err:
                    if _is_not_found_error(retry_err):
                        logger.warning(f"Corpus already gone after batch delete: {corpus_name}")
                    else:
                        logger.error(f"Failed to delete empty corpus after batch delete: {retry_err}")
                        raise
            else:
                raise

        # 로컬 DB에서도 삭제 (외부 리소스 삭제 결과와 무관하게 항상 실행)
        if db:
            from ..models.corpus import Corpus
            corpus = db.query(Corpus).filter(
                Corpus.corpus_name == corpus_name
            ).first()
            if corpus:
                db.delete(corpus)
                db.commit()

    @staticmethod
    def list_corpora() -> List[dict]:
        """List all RAG corpora in Vertex AI"""
        try:
            _init_vertex_ai()
            corpora = rag.list_corpora()
            result = []
            for c in corpora:
                result.append({
                    "corpus_name": c.name,
                    "display_name": getattr(c, 'display_name', c.name),
                    "description": getattr(c, 'description', None),
                    "document_count": 0,
                })
            logger.info(f"Listed {len(result)} RAG corpora")
            return result
        except Exception as e:
            logger.error(f"Error listing RAG corpora: {e}")
            raise

    @staticmethod
    def get_corpus(corpus_name: str, page_size: int = 10, page_token: Optional[str] = None) -> dict:
        """Get a single RAG corpus details with files"""
        try:
            _init_vertex_ai()
            corpus = rag.get_corpus(name=corpus_name)

            files = list(rag.list_files(corpus_name=corpus_name))
            total_count = len(files)

            start_idx = 0
            if page_token:
                try:
                    start_idx = int(page_token)
                except ValueError:
                    start_idx = 0

            end_idx = start_idx + page_size
            page_files = files[start_idx:end_idx]
            has_next_page = end_idx < total_count
            next_token = str(end_idx) if has_next_page else None

            doc_list = []
            for f in page_files:
                doc_list.append({
                    "document_name": f.name,
                    "display_name": getattr(f, 'display_name', f.name),
                    "file_size": getattr(f, 'size_bytes', None),
                    "mime_type": getattr(f, 'mime_type', None),
                    "uploaded_at": getattr(f, 'create_time', None),
                })

            result = {
                "corpus_name": corpus.name,
                "display_name": getattr(corpus, 'display_name', corpus.name),
                "description": getattr(corpus, 'description', None),
                "total_count": total_count,
                "documents": doc_list,
                "has_next_page": has_next_page,
                "next_page_token": next_token,
            }

            logger.info(f"Loaded {len(doc_list)} files (total: {total_count}, has_next: {has_next_page})")
            return result
        except Exception as e:
            logger.error(f"Error getting RAG corpus: {e}")
            raise
