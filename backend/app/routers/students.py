from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.student import Student, StudentClass
from ..models.user import User
from ..schemas.student import (
    StudentClassCreate,
    StudentClassResponse,
    StudentClassUpdate,
    StudentCreate,
    StudentResponse,
    StudentUpdate,
)
from ..utils.dependencies import get_current_admin_user

router = APIRouter()


# ==================== StudentClass CRUD ====================


@router.get("/classes", response_model=List[StudentClassResponse])
async def list_classes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """List all student classes in current tenant (Admin only)"""
    return (
        db.query(StudentClass)
        .filter(StudentClass.tenant_id == current_user.tenant_id)
        .order_by(StudentClass.created_at)
        .all()
    )


@router.post(
    "/classes", response_model=StudentClassResponse, status_code=status.HTTP_201_CREATED
)
async def create_class(
    data: StudentClassCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Create a new student class (Admin only)"""
    if data.code:
        existing = (
            db.query(StudentClass)
            .filter(
                StudentClass.tenant_id == current_user.tenant_id,
                StudentClass.code == data.code,
            )
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Class code already exists")

    cleaned = {k: (None if v == "" else v) for k, v in data.model_dump().items()}
    new_class = StudentClass(**cleaned, tenant_id=current_user.tenant_id)
    db.add(new_class)
    db.commit()
    db.refresh(new_class)
    return new_class


@router.put("/classes/{class_id}", response_model=StudentClassResponse)
async def update_class(
    class_id: int,
    data: StudentClassUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Update a student class (Admin only)"""
    cls = (
        db.query(StudentClass)
        .filter(
            StudentClass.id == class_id,
            StudentClass.tenant_id == current_user.tenant_id,
        )
        .first()
    )
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")

    if data.code and data.code != cls.code:
        existing = (
            db.query(StudentClass)
            .filter(
                StudentClass.tenant_id == current_user.tenant_id,
                StudentClass.code == data.code,
                StudentClass.id != class_id,
            )
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Class code already exists")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(cls, field, None if value == "" else value)

    db.commit()
    db.refresh(cls)
    return cls


@router.delete("/classes/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_class(
    class_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Delete a student class (Admin only). Students in class will have class_id set to NULL."""
    cls = (
        db.query(StudentClass)
        .filter(
            StudentClass.id == class_id,
            StudentClass.tenant_id == current_user.tenant_id,
        )
        .first()
    )
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")

    db.delete(cls)
    db.commit()


# ==================== Student CRUD ====================


@router.get("/students", response_model=List[StudentResponse])
async def list_students(
    class_id: Optional[int] = Query(None),
    student_status: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """List students with optional filtering (Admin only)"""
    query = db.query(Student).filter(Student.tenant_id == current_user.tenant_id)

    if class_id is not None:
        query = query.filter(Student.class_id == class_id)
    if student_status:
        query = query.filter(Student.status == student_status)
    if search:
        query = query.filter(Student.name.contains(search))

    return query.order_by(Student.name).all()


@router.post(
    "/students", response_model=StudentResponse, status_code=status.HTTP_201_CREATED
)
async def create_student(
    data: StudentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Create a new student (Admin only)"""
    if data.class_id:
        cls = (
            db.query(StudentClass)
            .filter(
                StudentClass.id == data.class_id,
                StudentClass.tenant_id == current_user.tenant_id,
            )
            .first()
        )
        if not cls:
            raise HTTPException(status_code=404, detail="Class not found")

        # 정원 체크
        if cls.capacity is not None:
            current_count = (
                db.query(Student)
                .filter(
                    Student.tenant_id == current_user.tenant_id,
                    Student.class_id == data.class_id,
                )
                .count()
            )
            if current_count >= cls.capacity:
                raise HTTPException(
                    status_code=400,
                    detail="정원이 가득 찬 분반입니다.",
                )

    cleaned = {k: (None if v == "" else v) for k, v in data.model_dump().items()}
    new_student = Student(**cleaned, tenant_id=current_user.tenant_id)
    db.add(new_student)
    db.commit()
    db.refresh(new_student)
    return new_student


@router.put("/students/{student_id}", response_model=StudentResponse)
async def update_student(
    student_id: int,
    data: StudentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Update student info (Admin only)"""
    student = (
        db.query(Student)
        .filter(
            Student.id == student_id,
            Student.tenant_id == current_user.tenant_id,
        )
        .first()
    )
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    if data.class_id:
        cls = (
            db.query(StudentClass)
            .filter(
                StudentClass.id == data.class_id,
                StudentClass.tenant_id == current_user.tenant_id,
            )
            .first()
        )
        if not cls:
            raise HTTPException(status_code=404, detail="Class not found")

    # 다른 분반으로 이동하는 경우에만 정원 체크
        if data.class_id != student.class_id and cls.capacity is not None:
            current_count = (
                db.query(Student)
                .filter(
                    Student.tenant_id == current_user.tenant_id,
                    Student.class_id == data.class_id,
                )
                .count()
            )
            if current_count >= cls.capacity:
                raise HTTPException(
                    status_code=400,
                    detail="정원이 가득 찬 분반입니다.",
                )

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(student, field, None if value == "" else value)

    db.commit()
    db.refresh(student)
    return student


@router.delete("/students/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Delete a student (Admin only)"""
    student = (
        db.query(Student)
        .filter(
            Student.id == student_id,
            Student.tenant_id == current_user.tenant_id,
        )
        .first()
    )
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    db.delete(student)
    db.commit()
