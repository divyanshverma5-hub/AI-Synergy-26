"""Human review endpoints and the audit log."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import AuditLog, Review
from ..schemas import (
    AuditLogOut,
    PaginatedAudit,
    PaginatedReviews,
    ReviewCreate,
    ReviewOut,
)
from ..services.review import ReviewError, list_reviews, submit_review, training_dataset

router = APIRouter(prefix="/api", tags=["reviews"])


@router.get("/reviews", response_model=PaginatedReviews)
def get_reviews(
    session: Session = Depends(get_session),
    decision: str | None = Query(default=None),
    reviewer: str | None = Query(default=None),
    finding_id: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
) -> PaginatedReviews:
    rows, total = list_reviews(
        session,
        decision=decision,
        reviewer=reviewer,
        finding_id=finding_id,
        limit=page_size,
        offset=(page - 1) * page_size,
    )
    return PaginatedReviews(
        items=[ReviewOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, (total + page_size - 1) // page_size),
    )


@router.post("/reviews", response_model=ReviewOut, status_code=201)
def create_review(payload: ReviewCreate, session: Session = Depends(get_session)) -> ReviewOut:
    try:
        review = submit_review(
            session,
            finding_id=payload.finding_id,
            decision=payload.decision,
            updated_label=payload.updated_label,
            reason=payload.reason,
            notes=payload.notes,
            reviewer=payload.reviewer,
            is_usable_for_training=payload.is_usable_for_training,
        )
    except ReviewError as exc:
        message = str(exc)
        status = 404 if "not found" in message else 422
        session.rollback()
        raise HTTPException(status_code=status, detail=message) from exc
    session.commit()
    session.refresh(review)
    return ReviewOut.model_validate(review)


@router.get("/audit-log", response_model=PaginatedAudit)
def get_audit_log(
    session: Session = Depends(get_session),
    entity_id: str | None = Query(default=None),
    entity_type: str | None = Query(default=None),
    action: str | None = Query(default=None),
    actor: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
) -> PaginatedAudit:
    stmt = select(AuditLog)
    if entity_id:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if actor:
        stmt = stmt.where(AuditLog.actor == actor)

    total = session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = session.scalars(
        stmt.order_by(AuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = []
    for row in rows:
        # `context` is stored as a JSON string; parse it into the response dict.
        items.append(
            AuditLogOut(
                id=row.id,
                actor=row.actor,
                action=row.action,
                entity_type=row.entity_type,
                entity_id=row.entity_id,
                previous_value=row.previous_value,
                new_value=row.new_value,
                reason=row.reason,
                context=_load(row.context),
                created_at=row.created_at,
            )
        )
    return PaginatedAudit(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, (total + page_size - 1) // page_size),
    )


@router.get("/reviews/training-export")
def get_training_export(
    session: Session = Depends(get_session), limit: int = Query(default=1000, ge=1, le=10000)
) -> dict:
    """// TODO(TRAINING-DATA): validated reviewer corrections for future training.

    Exposed read-only so the ML team can pull the corpus. Submitting a review
    never triggers retraining.
    """
    rows = training_dataset(session, limit=limit)
    return {"count": len(rows), "records": rows, "note": "Reviewer corrections only; no auto-retraining."}


def _load(raw: str | None) -> dict:
    import json

    if not raw:
        return {}
    try:
        value = json.loads(raw)
        return value if isinstance(value, dict) else {"value": value}
    except json.JSONDecodeError:
        return {}
