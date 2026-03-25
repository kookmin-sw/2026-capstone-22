from pydantic import BaseModel
from typing import List, Optional


class TenantUsageSummary(BaseModel):
    tenant_id: int
    tenant_name: str
    tenant_slug: str
    total_api_calls: int
    total_prompt_tokens: int
    total_completion_tokens: int
    total_tokens: int
    estimated_cost_usd: float
    storage_bytes: int
    storage_cost_usd: float


class DailyUsage(BaseModel):
    date: str
    api_calls: int
    total_tokens: int
    estimated_cost_usd: float


class CallTypeBreakdown(BaseModel):
    call_type: str
    count: int
    total_tokens: int
    estimated_cost_usd: float


class ModelBreakdown(BaseModel):
    model_name: str
    count: int
    total_tokens: int
    estimated_cost_usd: float


class BillingSummaryResponse(BaseModel):
    period_days: int
    start_date: str
    end_date: str
    total_api_calls: int
    total_tokens: int
    total_estimated_cost_usd: float
    total_storage_bytes: int
    total_storage_cost_usd: float
    tenants: List[TenantUsageSummary]


class TenantBillingDetailResponse(BaseModel):
    tenant_id: int
    tenant_name: str
    tenant_slug: str
    period_days: int
    total_api_calls: int
    total_tokens: int
    total_prompt_tokens: int
    total_completion_tokens: int
    estimated_cost_usd: float
    storage_bytes: int
    storage_cost_usd: float
    daily_usage: List[DailyUsage]
    call_type_breakdown: List[CallTypeBreakdown]
    model_breakdown: List[ModelBreakdown]
