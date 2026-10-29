"""Stage 6: human review.

Reviewer decisions are appended as immutable `Review` rows and mirrored onto the
finding's current state. The full decision history is preserved: nothing is
overwritten, and every change is written to the audit log.

// TODO(TRAINING-DATA): export `Review` rows where `is_usable_for_training` is
// true (joined to the clause text and model prediction) as the training corpus.
// Reviewer submissions do NOT trigger automatic retraining.
"""

from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Finding, Review
from . import audit
from .health import health_category_for

_DECISION_TO_STATUS = {
    "confirm": "confirmed",
    "reject": "rejected",
    "relabel": "relabelled",
    "insufficient_evidence": "insufficient_evidence",
}


class ReviewError(Exception):
    """Raised for review requests that violate the decision rules."""


def submit_review(
    session: Session,
    *,
    finding_id: str,
    decision: str,
    updated_label: str | None,
    reason: str,
    notes: str,
    reviewer: str,
    is_usable_for_training: bool,
) -> Review:
    finding = session.get(Finding, finding_id)
    if finding is None:
        raise ReviewError("finding not found")

    if decision not in _DECISION_TO_STATUS:
        raise ReviewError(f"unsupported decision: {decision}")
    if decision == "relabel":
        if not updated_label:
            raise ReviewError("a relabelled decision must include updated_label")
        if updated_label == finding.predicted_label and finding.effective_label is None:
            raise ReviewError("updated_label must differ from the current prediction")

    previous_label = finding.effective_label or finding.predicted_label
    previous_status = finding.review_status
    previous_health = finding.health_category

    if decision == "confirm":
        finding.effective_label = finding.predicted_label
        finding.evidence_sufficient = True
    elif decision == "relabel":
        finding.effective_label = updated_label
    elif decision == "insufficient_evidence":
        finding.effective_label = None
        finding.evidence_sufficient = False
    elif decision == "reject":
        # Rejection clears the settled label; the prediction is retained for audit.
        finding.effective_label = None
        finding.evidence_sufficient = False

    finding.review_status = _DECISION_TO_STATUS[decision]
    finding.health_category = health_category_for(finding)
    # Unresolved findings keep asking for attention: still pending, or a reviewer
    # could not reach a conclusion for want of evidence.
    finding.requires_review = finding.review_status in {"pending", "insufficient_evidence"}

    review = Review(
        finding_id=finding.id,
        reviewer=reviewer,
        decision=decision,
        previous_label=previous_label,
        updated_label=finding.effective_label,
        reason=reason,
        notes=notes,
        is_usable_for_training=is_usable_for_training,
    )
    session.add(review)
    session.flush()

    audit.record(
        session,
        action=f"review.{decision}",
        entity_type="finding",
        entity_id=finding.id,
        actor=reviewer,
        previous_value={"label": previous_label, "review_status": previous_status, "health_category": previous_health},
        new_value={
            "label": finding.effective_label,
            "review_status": finding.review_status,
            "health_category": finding.health_category,
        },
        reason=reason or None,
        context={
            "review_id": review.id,
            "predicted_label": finding.predicted_label,
            "notes": notes,
            "is_usable_for_training": is_usable_for_training,
            "analysis_id": finding.analysis_id,
            "document_id": finding.document_id,
            "clause_id": finding.clause_id,
        },
    )
    return review


def list_reviews(
    session: Session,
    *,
    decision: str | None = None,
    reviewer: str | None = None,
    finding_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Review], int]:
    stmt = select(Review)
    if decision:
        stmt = stmt.where(Review.decision == decision)
    if reviewer:
        stmt = stmt.where(Review.reviewer == reviewer)
    if finding_id:
        stmt = stmt.where(Review.finding_id == finding_id)
    rows = list(session.scalars(stmt.order_by(Review.created_at.desc())))
    return rows[offset : offset + limit], len(rows)


def training_dataset(session: Session, limit: int = 5000) -> list[dict]:
    """Validated corrections for future retraining.

    // TODO(TRAINING-DATA): replace with a versioned export job writing to the
    // training store; this inline helper keeps the shape documented.
    """
    stmt = (
        select(Review, Finding)
        .join(Finding, Finding.id == Review.finding_id)
        .where(Review.is_usable_for_training.is_(True))
        .order_by(Review.created_at.desc())
        .limit(limit)
    )
    rows: list[dict] = []
    for review, finding in session.execute(stmt):
        rows.append(
            {
                "review_id": review.id,
                "finding_id": finding.id,
                "clause_id": finding.clause_id,
                "predicted_label": finding.predicted_label,
                "confidence": finding.confidence,
                "decision": review.decision,
                "corrected_label": review.updated_label,
                "reason": review.reason,
                "reviewer": review.reviewer,
                "created_at": review.created_at.isoformat(),
            }
        )
    return rows
