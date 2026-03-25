import logging
import json
import os
from typing import Optional
from google.cloud import storage
from google.oauth2 import service_account
from ..config import settings

logger = logging.getLogger(__name__)

_client: Optional[storage.Client] = None
_tenant_clients: dict = {}  # tenant_id -> (client, bucket_name)


def _get_vertex_credentials_path() -> Optional[str]:
    """Get Vertex AI credentials path from platform settings (DB) or env."""
    try:
        from .gemini_client import _get_platform_setting
        path = _get_platform_setting("GCP_CREDENTIALS_PATH")
        if path and os.path.exists(path):
            return path
    except Exception:
        pass
    return None


def _get_client_with_credentials(credentials_path: str = None) -> storage.Client:
    """Create a GCS client using the given credentials path."""
    if credentials_path and os.path.exists(credentials_path):
        credentials = service_account.Credentials.from_service_account_file(credentials_path)
        return storage.Client(credentials=credentials, project=credentials.project_id)
    return storage.Client()


def _get_client() -> storage.Client:
    """Get or create a GCS client (singleton) - uses Vertex AI credentials."""
    global _client
    if _client is None:
        creds_path = _get_vertex_credentials_path()
        _client = _get_client_with_credentials(creds_path)
        logger.info(f"GCS client initialized (credentials: {creds_path})")
    return _client


def _get_tenant_gcs(tenant_id: int, db) -> tuple:
    """Get tenant-specific GCS client and bucket name.
    Priority: tenant-specific credentials > Vertex AI credentials."""
    if tenant_id in _tenant_clients:
        return _tenant_clients[tenant_id]

    from ..models.tenant import TenantGcpConfig

    gcp_config = db.query(TenantGcpConfig).filter(
        TenantGcpConfig.tenant_id == tenant_id
    ).first()

    if not gcp_config or not gcp_config.gcs_bucket_name:
        # No bucket configured for this tenant
        return (_get_client(), None)

    # Use Vertex AI credentials with tenant's bucket name
    result = (_get_client(), gcp_config.gcs_bucket_name)
    _tenant_clients[tenant_id] = result
    logger.info(f"GCS client for tenant {tenant_id}: {gcp_config.gcs_bucket_name} (shared credentials)")
    return result


def upload_file(local_path: str, gcs_path: str, content_type: Optional[str] = None, tenant_id: int = None, db=None) -> str:
    if tenant_id and db:
        gcs_client, bucket_name = _get_tenant_gcs(tenant_id, db)
    else:
        gcs_client = _get_client()
        bucket_name = None

    if not bucket_name:
        raise ValueError("Cannot determine bucket name")

    bucket = gcs_client.bucket(bucket_name)
    blob = bucket.blob(gcs_path)
    if content_type:
        blob.content_type = content_type
    blob.upload_from_filename(local_path, timeout=600)
    logger.info(f"Uploaded to GCS: gs://{bucket_name}/{gcs_path}")
    return gcs_path


def generate_signed_url(gcs_path: str, expiration_minutes: int = 60, tenant_id: int = None, db=None, download_filename: str = None) -> Optional[str]:
    if tenant_id and db:
        gcs_client, bucket_name = _get_tenant_gcs(tenant_id, db)
    else:
        gcs_client = _get_client()
        bucket_name = None

    if not bucket_name or not gcs_path:
        return None

    import datetime
    try:
        bucket = gcs_client.bucket(bucket_name)
        blob = bucket.blob(gcs_path)

        kwargs = {
            "version": "v4",
            "expiration": datetime.timedelta(minutes=expiration_minutes),
            "method": "GET",
        }
        if download_filename:
            kwargs["response_disposition"] = f'attachment; filename="{download_filename}"'

        url = blob.generate_signed_url(**kwargs)
        return url
    except Exception as e:
        logger.warning(f"Failed to generate signed URL for {gcs_path}: {e}")
        return None


def delete_file(gcs_path: str, tenant_id: int = None, db=None) -> bool:
    try:
        if tenant_id and db:
            gcs_client, bucket_name = _get_tenant_gcs(tenant_id, db)
        else:
            gcs_client = _get_client()
            bucket_name = None

        if not bucket_name:
            return False

        bucket = gcs_client.bucket(bucket_name)
        blob = bucket.blob(gcs_path)
        blob.delete()
        logger.info(f"Deleted from GCS: gs://{bucket_name}/{gcs_path}")
        return True
    except Exception as e:
        logger.warning(f"Failed to delete from GCS {gcs_path}: {e}")
        return False


def get_bucket_name(tenant_id: int = None, db=None) -> str:
    """Get the GCS bucket name for the given tenant."""
    if tenant_id and db:
        _, bucket_name = _get_tenant_gcs(tenant_id, db)
        return bucket_name
    return None


def is_configured(tenant_id: int = None, db=None) -> bool:
    """Check if GCS is configured: tenant has a bucket name."""
    if tenant_id and db:
        from ..models.tenant import TenantGcpConfig
        gcp_config = db.query(TenantGcpConfig).filter(
            TenantGcpConfig.tenant_id == tenant_id
        ).first()
        if gcp_config and gcp_config.gcs_bucket_name:
            return True
    return False
