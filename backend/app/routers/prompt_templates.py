from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models.prompt_template import PromptTemplate
from ..models.user import User
from ..schemas.prompt_template import (
    PromptTemplateResponse,
    PromptTemplateListItem,
    PromptTemplateCreate,
    PromptTemplateUpdate,
)
from ..utils.dependencies import get_current_user, get_current_admin_user

router = APIRouter()


# ==================== Public Endpoints (For ChatPage) ====================


@router.get("", response_model=List[PromptTemplateListItem])
async def list_active_templates(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """활성화된 프롬프트 템플릿 목록 조회 (버튼용)"""
    templates = (
        db.query(PromptTemplate)
        .filter(
            PromptTemplate.is_active == True,
            PromptTemplate.tenant_id == current_user.tenant_id,
        )
        .order_by(PromptTemplate.display_order)
        .all()
    )
    return templates


@router.get("/{template_id}", response_model=PromptTemplateResponse)
async def get_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """프롬프트 템플릿 전문 조회"""
    template = (
        db.query(PromptTemplate)
        .filter(
            PromptTemplate.id == template_id,
            PromptTemplate.tenant_id == current_user.tenant_id,
        )
        .first()
    )

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    return template


# ==================== Admin Endpoints ====================


@router.get("/admin/all", response_model=List[PromptTemplateResponse])
async def list_all_templates(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)
):
    """모든 프롬프트 템플릿 목록 조회 (관리자용)"""
    templates = (
        db.query(PromptTemplate)
        .filter(PromptTemplate.tenant_id == current_user.tenant_id)
        .order_by(PromptTemplate.display_order)
        .all()
    )
    return templates


@router.post(
    "", response_model=PromptTemplateResponse, status_code=status.HTTP_201_CREATED
)
async def create_template(
    template: PromptTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """프롬프트 템플릿 생성 (관리자 전용)"""
    new_template = PromptTemplate(
        title=template.title,
        description=template.description,
        content=template.content,
        icon=template.icon,
        is_active=template.is_active,
        display_order=template.display_order,
        tenant_id=current_user.tenant_id,
    )
    db.add(new_template)
    db.commit()
    db.refresh(new_template)
    return new_template


@router.put("/{template_id}", response_model=PromptTemplateResponse)
async def update_template(
    template_id: int,
    template_update: PromptTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """프롬프트 템플릿 수정 (관리자 전용)"""
    template = (
        db.query(PromptTemplate)
        .filter(
            PromptTemplate.id == template_id,
            PromptTemplate.tenant_id == current_user.tenant_id,
        )
        .first()
    )

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if template_update.title is not None:
        template.title = template_update.title
    if template_update.description is not None:
        template.description = template_update.description
    if template_update.content is not None:
        template.content = template_update.content
    if template_update.icon is not None:
        template.icon = template_update.icon
    if template_update.is_active is not None:
        template.is_active = template_update.is_active
    if template_update.display_order is not None:
        template.display_order = template_update.display_order

    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """프롬프트 템플릿 삭제 (관리자 전용)"""
    template = (
        db.query(PromptTemplate)
        .filter(
            PromptTemplate.id == template_id,
            PromptTemplate.tenant_id == current_user.tenant_id,
        )
        .first()
    )

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    db.delete(template)
    db.commit()


@router.put("/admin/reorder", response_model=List[PromptTemplateResponse])
async def reorder_templates(
    order: List[int],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """프롬프트 템플릿 순서 일괄 변경 (관리자 전용)

    order: 템플릿 ID 배열 (새로운 순서대로)
    """
    templates = (
        db.query(PromptTemplate)
        .filter(
            PromptTemplate.id.in_(order),
            PromptTemplate.tenant_id == current_user.tenant_id,
        )
        .all()
    )

    template_map = {t.id: t for t in templates}

    for idx, template_id in enumerate(order):
        if template_id in template_map:
            template_map[template_id].display_order = idx + 1

    db.commit()

    # 업데이트된 템플릿 목록 반환
    updated_templates = (
        db.query(PromptTemplate)
        .filter(PromptTemplate.tenant_id == current_user.tenant_id)
        .order_by(PromptTemplate.display_order)
        .all()
    )
    return updated_templates
