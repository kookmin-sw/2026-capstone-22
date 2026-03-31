"""Vertex AI Search (Discovery Engine) service for hybrid search"""

import logging
import time
from typing import List, Optional, Dict, Any
from google.api_core.client_options import ClientOptions
from google.cloud import discoveryengine_v1 as discoveryengine

logger = logging.getLogger(__name__)


def _is_not_found_error(e: Exception) -> bool:
    """Check if an exception indicates a resource was already deleted / not found"""
    error_str = str(e)
    return (
        "404" in error_str
        or "not found" in error_str.lower()
        or "NOT_FOUND" in error_str
    )


class SearchService:
    """Service for managing Vertex AI Search data stores and searching documents"""

    LOCATION = "global"  # Vertex AI Search requires global location

    @staticmethod
    def _get_project_id() -> str:
        from .gemini_client import _get_vertex_project

        return _get_vertex_project()

    @staticmethod
    def _get_client_options():
        return ClientOptions(
            api_endpoint=f"{SearchService.LOCATION}-discoveryengine.googleapis.com"
        )

    @staticmethod
    def _get_parent():
        project_id = SearchService._get_project_id()
        return f"projects/{project_id}/locations/{SearchService.LOCATION}/collections/default_collection"

    # ─── Data Store (Corpus) CRUD ───

    @staticmethod
    def create_data_store(
        data_store_id: str, display_name: str, description: Optional[str] = None
    ) -> dict:
        """Create a new data store (equivalent to RAG corpus)"""
        try:
            from .gemini_client import _ensure_credentials

            _ensure_credentials()

            client = discoveryengine.DataStoreServiceClient(
                client_options=SearchService._get_client_options()
            )

            data_store = discoveryengine.DataStore(
                display_name=display_name,
                industry_vertical=discoveryengine.IndustryVertical.GENERIC,
                solution_types=[discoveryengine.SolutionType.SOLUTION_TYPE_SEARCH],
                content_config=discoveryengine.DataStore.ContentConfig.CONTENT_REQUIRED,
            )

            request = discoveryengine.CreateDataStoreRequest(
                parent=SearchService._get_parent(),
                data_store_id=data_store_id,
                data_store=data_store,
            )

            operation = client.create_data_store(request=request)
            response = operation.result(timeout=120)

            logger.info(f"Created data store: {response.name}")

            # Create a dedicated search engine for this data store (1:1 mapping required)
            engine_name = None
            try:
                engine_result = SearchService.create_engine(
                    engine_id=data_store_id,
                    display_name=display_name,
                    data_store_names=[response.name],
                )
                engine_name = engine_result["engine_name"]
                logger.info(f"Auto-created engine: {engine_name}")
            except Exception as engine_err:
                logger.warning(f"Failed to auto-create engine: {engine_err}")

            return {
                "data_store_name": response.name,
                "engine_name": engine_name,
                "display_name": display_name,
                "description": description,
            }
        except Exception as e:
            logger.error(f"Error creating data store: {e}")
            raise

    @staticmethod
    def create_engine(
        engine_id: str, display_name: str, data_store_names: List[str]
    ) -> dict:
        """Create a search engine linked to one or more data stores"""
        try:
            from .gemini_client import _ensure_credentials

            _ensure_credentials()

            client = discoveryengine.EngineServiceClient(
                client_options=SearchService._get_client_options()
            )

            engine = discoveryengine.Engine(
                display_name=display_name,
                solution_type=discoveryengine.SolutionType.SOLUTION_TYPE_SEARCH,
                search_engine_config=discoveryengine.Engine.SearchEngineConfig(
                    search_tier=discoveryengine.SearchTier.SEARCH_TIER_ENTERPRISE,
                    search_add_ons=[discoveryengine.SearchAddOn.SEARCH_ADD_ON_LLM],
                ),
                data_store_ids=[name.split("/")[-1] for name in data_store_names],
            )

            request = discoveryengine.CreateEngineRequest(
                parent=SearchService._get_parent(),
                engine_id=engine_id,
                engine=engine,
            )

            operation = client.create_engine(request=request)
            response = operation.result(timeout=120)

            logger.info(f"Created engine: {response.name}")
            return {
                "engine_name": response.name,
                "display_name": display_name,
            }
        except Exception as e:
            logger.error(f"Error creating engine: {e}")
            raise

    @staticmethod
    def add_data_store_to_engine(data_store_id: str) -> None:
        """Add a data store to the shared search engine via platform settings"""
        try:
            from .gemini_client import _ensure_credentials

            _ensure_credentials()

            # Get engine name from platform settings
            from ..database import SessionLocal
            from ..models.platform_setting import PlatformSetting

            db = SessionLocal()
            try:
                row = (
                    db.query(PlatformSetting)
                    .filter(PlatformSetting.key == "VERTEX_AI_SEARCH_ENGINE")
                    .first()
                )
                engine_name = row.value if row else None
            finally:
                db.close()

            if not engine_name:
                logger.warning(
                    "VERTEX_AI_SEARCH_ENGINE not configured, skipping engine link"
                )
                return

            client = discoveryengine.EngineServiceClient(
                client_options=SearchService._get_client_options()
            )

            # Get current engine to read existing data_store_ids
            engine = client.get_engine(name=engine_name)
            current_ids = list(engine.data_store_ids) if engine.data_store_ids else []

            if data_store_id not in current_ids:
                current_ids.append(data_store_id)

                # Update engine with new data store list
                from google.protobuf import field_mask_pb2

                engine.data_store_ids = current_ids
                request = discoveryengine.UpdateEngineRequest(
                    engine=engine,
                    update_mask=field_mask_pb2.FieldMask(paths=["data_store_ids"]),
                )
                client.update_engine(request=request)
                logger.info(f"Added data store {data_store_id} to engine {engine_name}")
            else:
                logger.info(f"Data store {data_store_id} already linked to engine")

        except Exception as e:
            logger.error(f"Error adding data store to engine: {e}")
            raise

    @staticmethod
    def delete_data_store(data_store_name: str):
        """Delete a data store and its associated engine.

        If either resource is already deleted (404/NOT_FOUND), logs a warning and continues.
        Engine deletion failure does not block data store deletion.
        """
        from .gemini_client import _ensure_credentials

        _ensure_credentials()

        # Delete engine first (1:1 mapping: engine ID = data store ID)
        engine_name = data_store_name.replace("/dataStores/", "/engines/")
        try:
            engine_client = discoveryengine.EngineServiceClient(
                client_options=SearchService._get_client_options()
            )
            engine_client.delete_engine(name=engine_name)
            logger.info(f"Engine delete requested: {engine_name}")
            # Wait for engine deletion to propagate
            import time as _time

            _time.sleep(5)
        except Exception as eng_err:
            if _is_not_found_error(eng_err):
                logger.warning(f"Engine already deleted (not found): {engine_name}")
            else:
                logger.warning(
                    f"Engine delete failed (continuing with data store deletion): {eng_err}"
                )

        # Then delete data store
        try:
            client = discoveryengine.DataStoreServiceClient(
                client_options=SearchService._get_client_options()
            )
            request = discoveryengine.DeleteDataStoreRequest(name=data_store_name)
            client.delete_data_store(request=request)
            logger.info(f"Data store delete requested: {data_store_name}")
        except Exception as e:
            if _is_not_found_error(e):
                logger.warning(
                    f"Data store already deleted (not found): {data_store_name}"
                )
            else:
                logger.error(f"Error deleting data store: {e}")
                raise

    # ─── Document Upload ───

    @staticmethod
    def import_document_from_gcs(
        data_store_name: str, gcs_uri: str, document_id: str
    ) -> dict:
        """Import a document from GCS into the data store"""
        try:
            from .gemini_client import _ensure_credentials

            _ensure_credentials()

            client = discoveryengine.DocumentServiceClient(
                client_options=SearchService._get_client_options()
            )

            parent = f"{data_store_name}/branches/default_branch"

            request = discoveryengine.ImportDocumentsRequest(
                parent=parent,
                gcs_source=discoveryengine.GcsSource(
                    input_uris=[gcs_uri],
                    data_schema="content",
                ),
                reconciliation_mode=discoveryengine.ImportDocumentsRequest.ReconciliationMode.INCREMENTAL,
            )

            operation = client.import_documents(request=request)
            # Don't block — indexing happens asynchronously on GCP
            logger.info(f"Import started (async) for {gcs_uri} to {data_store_name}")

            return {
                "status": "indexing",
                "document_id": document_id,
                "gcs_uri": gcs_uri,
            }
        except Exception as e:
            logger.error(f"Error importing document: {e}")
            raise

    @staticmethod
    def delete_document(data_store_name: str, document_id: str):
        """Delete a document from the data store.

        If the document is already deleted (404/NOT_FOUND), logs a warning and returns normally.
        """
        try:
            from .gemini_client import _ensure_credentials

            _ensure_credentials()

            client = discoveryengine.DocumentServiceClient(
                client_options=SearchService._get_client_options()
            )

            doc_name = (
                f"{data_store_name}/branches/default_branch/documents/{document_id}"
            )

            request = discoveryengine.DeleteDocumentRequest(name=doc_name)
            client.delete_document(request=request)

            logger.info(f"Deleted document: {doc_name}")
        except Exception as e:
            if _is_not_found_error(e):
                logger.warning(
                    f"Document already deleted (not found): {data_store_name}/documents/{document_id}"
                )
                return
            logger.error(f"Error deleting document: {e}")
            raise

    # ─── Search ───

    @staticmethod
    def search(
        engine_name: str = None,
        query: str = "",
        top_k: int = 10,
        data_store_names: List[str] = None,
    ) -> List[dict]:
        """Search using Vertex AI Search engines (hybrid search: semantic + keyword)

        Each data store has its own dedicated engine (1:1 mapping).
        Engine name is derived from data store name by replacing 'dataStores' with 'engines'.

        Args:
            engine_name: (deprecated) Single engine name, used as fallback
            query: Search query text
            top_k: Number of results to return
            data_store_names: List of data store names to search (tenant isolation)

        Returns:
            List of search result dicts with 'text', 'source', 'score'
        """
        try:
            from .gemini_client import _ensure_credentials

            _ensure_credentials()

            client = discoveryengine.SearchServiceClient(
                client_options=SearchService._get_client_options()
            )

            # Build engine names from data store names (1:1 mapping)
            engine_names = []
            if data_store_names:
                for ds_name in data_store_names:
                    # Convert: .../dataStores/xxx → .../engines/xxx
                    eng_name = ds_name.replace("/dataStores/", "/engines/")
                    engine_names.append(eng_name)
            elif engine_name:
                engine_names = [engine_name]

            if not engine_names:
                logger.warning("No engine names available for search")
                return []

            all_results = []
            for eng in engine_names:
                try:
                    serving_config = f"{eng}/servingConfigs/default_search"

                    request = discoveryengine.SearchRequest(
                        serving_config=serving_config,
                        query=query,
                        page_size=top_k,
                        content_search_spec=discoveryengine.SearchRequest.ContentSearchSpec(
                            snippet_spec=discoveryengine.SearchRequest.ContentSearchSpec.SnippetSpec(
                                return_snippet=True,
                            ),
                            extractive_content_spec=discoveryengine.SearchRequest.ContentSearchSpec.ExtractiveContentSpec(
                                max_extractive_answer_count=3,
                                max_extractive_segment_count=5,
                            ),
                        ),
                    )

                    response = client.search(request)

                    for result in response.results:
                        doc = result.document
                        doc_id = doc.id if doc else ""

                        text_parts = []
                        derived_data = doc.derived_struct_data if doc else None
                        if derived_data:
                            for snip in derived_data.get("snippets", []):
                                snippet_text = snip.get("snippet", "")
                                if snippet_text:
                                    text_parts.append(snippet_text)
                            for seg in derived_data.get("extractive_segments", []):
                                content = seg.get("content", "")
                                if content:
                                    text_parts.append(content)
                            for ans in derived_data.get("extractive_answers", []):
                                content = ans.get("content", "")
                                if content:
                                    text_parts.append(content)

                        chunk_text = "\n".join(text_parts) if text_parts else ""
                        # Strip HTML tags from snippets
                        if chunk_text:
                            import re

                            chunk_text = re.sub(r"<[^>]+>", "", chunk_text)
                            chunk_text = (
                                chunk_text.replace("&nbsp;", " ")
                                .replace("&amp;", "&")
                                .replace("&lt;", "<")
                                .replace("&gt;", ">")
                            )
                        if chunk_text:
                            all_results.append(
                                {
                                    "text": chunk_text,
                                    "source": doc_id,
                                    "score": getattr(result, "relevance_score", 0) or 0,
                                }
                            )

                except Exception as eng_err:
                    logger.warning(f"Search error for engine {eng}: {eng_err}")

            logger.info(
                f"Vertex AI Search: {len(all_results)} results across {len(engine_names)} engines for: {query[:50]}"
            )
            return all_results[:top_k]

        except Exception as e:
            logger.error(f"Search error: {e}")
            return []

    # ─── List ───

    @staticmethod
    def list_data_stores() -> List[dict]:
        """List all data stores"""
        try:
            from .gemini_client import _ensure_credentials

            _ensure_credentials()

            client = discoveryengine.DataStoreServiceClient(
                client_options=SearchService._get_client_options()
            )

            request = discoveryengine.ListDataStoresRequest(
                parent=SearchService._get_parent()
            )

            result = []
            for store in client.list_data_stores(request=request):
                result.append(
                    {
                        "data_store_name": store.name,
                        "display_name": store.display_name,
                    }
                )

            return result
        except Exception as e:
            logger.error(f"Error listing data stores: {e}")
            raise

    @staticmethod
    def list_documents(data_store_name: str) -> List[dict]:
        """List documents in a data store"""
        try:
            from .gemini_client import _ensure_credentials

            _ensure_credentials()

            client = discoveryengine.DocumentServiceClient(
                client_options=SearchService._get_client_options()
            )

            parent = f"{data_store_name}/branches/default_branch"
            request = discoveryengine.ListDocumentsRequest(parent=parent)

            result = []
            for doc in client.list_documents(request=request):
                result.append(
                    {
                        "document_id": doc.id,
                        "document_name": doc.name,
                    }
                )

            return result
        except Exception as e:
            logger.error(f"Error listing documents: {e}")
            raise
