"""
GCP Auto-Provisioning for new tenants.

Creates GCP project, enables APIs, generates keys, and creates GCS bucket.
Requires a platform service account with org-level permissions:
- resourcemanager.projects.create
- billing.resourceAssociations.create
- serviceusage.services.enable
"""
import logging
import json
import time
from typing import Optional, Dict, Any
from google.oauth2 import service_account
from ..config import settings

logger = logging.getLogger(__name__)


class TenantProvisioningError(Exception):
    """Error during tenant GCP provisioning"""
    pass


class TenantProvisioningService:
    """Handles GCP resource provisioning for new tenants"""

    @staticmethod
    def _get_platform_credentials():
        """Get platform-level service account credentials"""
        creds_path = getattr(settings, 'GCP_PLATFORM_CREDENTIALS_PATH', None)
        if not creds_path:
            raise TenantProvisioningError("GCP_PLATFORM_CREDENTIALS_PATH not configured")

        scopes = [
            'https://www.googleapis.com/auth/cloud-platform',
            'https://www.googleapis.com/auth/cloud-billing',
        ]
        credentials = service_account.Credentials.from_service_account_file(
            creds_path, scopes=scopes
        )
        return credentials

    @staticmethod
    def is_configured() -> bool:
        """Check if GCP provisioning is properly configured"""
        return bool(
            getattr(settings, 'GCP_ORG_ID', None) and
            getattr(settings, 'GCP_BILLING_ACCOUNT_ID', None) and
            getattr(settings, 'GCP_PLATFORM_CREDENTIALS_PATH', None)
        )

    @staticmethod
    async def provision_tenant(slug: str, tenant_id: int, db) -> Dict[str, Any]:
        """Full GCP provisioning for a new tenant.

        Args:
            slug: Tenant slug (used for project/bucket naming)
            tenant_id: Tenant ID in DB
            db: SQLAlchemy session

        Returns:
            Dict with provisioning results
        """
        import httpx

        if not TenantProvisioningService.is_configured():
            logger.warning("GCP provisioning not configured - creating placeholder config")
            return {"status": "skipped", "reason": "GCP provisioning not configured"}

        credentials = TenantProvisioningService._get_platform_credentials()
        project_id = f"readytalk-{slug}"
        bucket_name = f"readytalk-{slug}-docs"
        org_id = settings.GCP_ORG_ID
        billing_account = settings.GCP_BILLING_ACCOUNT_ID

        # Refresh credentials to get access token
        from google.auth.transport.requests import Request
        credentials.refresh(Request())
        headers = {
            "Authorization": f"Bearer {credentials.token}",
            "Content-Type": "application/json",
        }

        results = {}

        async with httpx.AsyncClient(timeout=60.0) as http_client:
            # Step 1: Create GCP Project
            try:
                resp = await http_client.post(
                    "https://cloudresourcemanager.googleapis.com/v1/projects",
                    headers=headers,
                    json={
                        "projectId": project_id,
                        "name": f"ReadyTalk - {slug}",
                        "parent": {"type": "organization", "id": org_id},
                    }
                )
                resp.raise_for_status()
                operation = resp.json()

                # Poll for operation completion
                op_name = operation.get("name", "")
                for _ in range(30):  # max 60s
                    op_resp = await http_client.get(
                        f"https://cloudresourcemanager.googleapis.com/v1/{op_name}",
                        headers=headers
                    )
                    op_data = op_resp.json()
                    if op_data.get("done"):
                        break
                    await _async_sleep(2)

                results["project"] = project_id
                logger.info(f"Created GCP project: {project_id}")
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 409:
                    logger.info(f"GCP project already exists: {project_id}")
                    results["project"] = project_id
                else:
                    raise TenantProvisioningError(f"Failed to create project: {e.response.text}")

            # Step 2: Link billing account
            try:
                resp = await http_client.put(
                    f"https://cloudbilling.googleapis.com/v1/projects/{project_id}/billingInfo",
                    headers=headers,
                    json={"billingAccountName": f"billingAccounts/{billing_account}"}
                )
                resp.raise_for_status()
                results["billing"] = True
                logger.info(f"Linked billing account to {project_id}")
            except Exception as e:
                logger.warning(f"Failed to link billing: {e}")
                results["billing"] = False

            # Step 3: Enable Gemini API
            try:
                resp = await http_client.post(
                    f"https://serviceusage.googleapis.com/v1/projects/{project_id}/services/generativelanguage.googleapis.com:enable",
                    headers=headers
                )
                resp.raise_for_status()
                # Wait for API to be enabled
                await _async_sleep(5)
                results["gemini_api"] = True
                logger.info(f"Enabled Gemini API for {project_id}")
            except Exception as e:
                logger.warning(f"Failed to enable Gemini API: {e}")
                results["gemini_api"] = False

            # Step 4: Create API Key for Gemini
            gemini_api_key = None
            try:
                resp = await http_client.post(
                    f"https://apikeys.googleapis.com/v2/projects/{project_id}/locations/global/keys",
                    headers=headers,
                    json={
                        "displayName": f"readytalk-{slug}-gemini",
                        "restrictions": {
                            "apiTargets": [{"service": "generativelanguage.googleapis.com"}]
                        }
                    }
                )
                resp.raise_for_status()
                key_operation = resp.json()

                # Poll for key creation
                op_name = key_operation.get("name", "")
                key_data = None
                for _ in range(15):
                    op_resp = await http_client.get(
                        f"https://apikeys.googleapis.com/v2/{op_name}",
                        headers=headers
                    )
                    op_data = op_resp.json()
                    if op_data.get("done"):
                        key_data = op_data.get("response", {})
                        break
                    await _async_sleep(2)

                if key_data:
                    key_name = key_data.get("name", "")
                    # Get the key string
                    key_resp = await http_client.get(
                        f"https://apikeys.googleapis.com/v2/{key_name}/keyString",
                        headers=headers
                    )
                    key_resp.raise_for_status()
                    gemini_api_key = key_resp.json().get("keyString")
                    results["api_key"] = True
                    logger.info(f"Created Gemini API key for {project_id}")
            except Exception as e:
                logger.warning(f"Failed to create API key: {e}")
                results["api_key"] = False

            # Step 5: Enable Cloud Storage API and create bucket
            gcs_credentials_json = None
            try:
                # Enable storage API
                await http_client.post(
                    f"https://serviceusage.googleapis.com/v1/projects/{project_id}/services/storage.googleapis.com:enable",
                    headers=headers
                )
                await _async_sleep(3)

                # Create bucket
                storage_headers = {**headers}
                resp = await http_client.post(
                    f"https://storage.googleapis.com/storage/v1/b?project={project_id}",
                    headers=storage_headers,
                    json={
                        "name": bucket_name,
                        "location": "ASIA-NORTHEAST3",  # Seoul
                        "storageClass": "STANDARD",
                    }
                )
                if resp.status_code == 409:
                    logger.info(f"GCS bucket already exists: {bucket_name}")
                else:
                    resp.raise_for_status()
                results["bucket"] = bucket_name
                logger.info(f"Created GCS bucket: {bucket_name}")
            except Exception as e:
                logger.warning(f"Failed to create GCS bucket: {e}")
                results["bucket"] = None

            # Step 6: Create service account for GCS
            try:
                # Enable IAM API
                await http_client.post(
                    f"https://serviceusage.googleapis.com/v1/projects/{project_id}/services/iam.googleapis.com:enable",
                    headers=headers
                )
                await _async_sleep(3)

                sa_name = f"readytalk-gcs-{slug[:20]}"
                resp = await http_client.post(
                    f"https://iam.googleapis.com/v1/projects/{project_id}/serviceAccounts",
                    headers=headers,
                    json={
                        "accountId": sa_name,
                        "serviceAccount": {
                            "displayName": f"ReadyTalk GCS - {slug}"
                        }
                    }
                )
                if resp.status_code == 409:
                    sa_email = f"{sa_name}@{project_id}.iam.gserviceaccount.com"
                else:
                    resp.raise_for_status()
                    sa_data = resp.json()
                    sa_email = sa_data.get("email")

                # Grant Storage Object Admin to the service account on the bucket
                if results.get("bucket"):
                    # Get current IAM policy
                    iam_resp = await http_client.get(
                        f"https://storage.googleapis.com/storage/v1/b/{bucket_name}/iam",
                        headers=headers
                    )
                    iam_policy = iam_resp.json() if iam_resp.status_code == 200 else {"bindings": []}

                    # Add binding
                    bindings = iam_policy.get("bindings", [])
                    bindings.append({
                        "role": "roles/storage.objectAdmin",
                        "members": [f"serviceAccount:{sa_email}"]
                    })
                    iam_policy["bindings"] = bindings

                    await http_client.put(
                        f"https://storage.googleapis.com/storage/v1/b/{bucket_name}/iam",
                        headers=headers,
                        json=iam_policy
                    )

                # Create service account key
                key_resp = await http_client.post(
                    f"https://iam.googleapis.com/v1/projects/{project_id}/serviceAccounts/{sa_email}/keys",
                    headers=headers,
                    json={"keyAlgorithm": "KEY_ALG_RSA_2048"}
                )
                key_resp.raise_for_status()
                key_data = key_resp.json()

                import base64
                gcs_credentials_json = base64.b64decode(key_data.get("privateKeyData", "")).decode()
                results["service_account"] = sa_email
                logger.info(f"Created service account: {sa_email}")
            except Exception as e:
                logger.warning(f"Failed to create service account: {e}")
                results["service_account"] = None

        # Step 7: Save to DB (encrypted)
        from ..models.tenant import TenantGcpConfig

        # Encrypt values
        def encrypt_value(value: str) -> str:
            key = getattr(settings, 'API_ENCRYPTION_KEY', None)
            if not key:
                return value
            import hashlib, base64
            from cryptography.fernet import Fernet
            fernet_key = base64.urlsafe_b64encode(hashlib.sha256(key.encode()).digest())
            f = Fernet(fernet_key)
            return f.encrypt(value.encode()).decode()

        gcp_config = db.query(TenantGcpConfig).filter(
            TenantGcpConfig.tenant_id == tenant_id
        ).first()

        if not gcp_config:
            gcp_config = TenantGcpConfig(tenant_id=tenant_id, gcp_project_id=project_id)
            db.add(gcp_config)

        gcp_config.gcp_project_id = project_id

        if gemini_api_key:
            gcp_config.gemini_api_key_encrypted = encrypt_value(gemini_api_key)

        if results.get("bucket"):
            gcp_config.gcs_bucket_name = results["bucket"]

        if gcs_credentials_json:
            gcp_config.gcp_credentials_encrypted = encrypt_value(gcs_credentials_json)

        db.commit()
        logger.info(f"Saved GCP config for tenant {tenant_id}")

        results["status"] = "completed"
        return results


async def _async_sleep(seconds):
    """Async sleep helper"""
    import asyncio
    await asyncio.sleep(seconds)
