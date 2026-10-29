"""Model metrics and dashboard endpoints."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..db import get_session
from ..models import Analysis, Document, Finding, ModelMetric, Review
from ..schemas import (
    AnalysisOut,
    DashboardOut,
    DocumentSummary,
    FindingSummary,
    MetricsOut,
)
from ..serializers import finding_summary

router = APIRouter(prefix="/api", tags=["metrics"])

LABELS = ("conflicts", "removes_safeguard", "consistent", "unrelated")


@router.get("/model/metrics", response_model=MetricsOut)
def get_metrics(session: Session = Depends(get_session)) -> MetricsOut:
    """Per-class metrics plus aggregate figures.

    Per-class precision/recall/F1 come from stored `ModelMetric` rows. Accuracy,
    macro-F1 and the confusion matrix are stored as a JSON blob on the latest
    evaluation row's context. When only demonstration rows exist the response is
    flagged `is_demonstration=True` and the UI labels it.
    """
    rows = list(session.scalars(select(ModelMetric).order_by(ModelMetric.created_at.desc())))
    if not rows:
        return _empty_metrics()

    latest_version = rows[0].model_version
    latest = [r for r in rows if r.model_version == latest_version]
    is_demo = any(r.is_demonstration for r in latest)

    per_class = [
        {
            "label": r.label,
            "precision": r.precision,
            "recall": r.recall,
            "f1": r.f1,
            "support": r.support,
        }
        for r in sorted(latest, key=lambda r: LABELS.index(r.label) if r.label in LABELS else 99)
    ]

    aggregates = _load_aggregates(session, latest_version)
    review_stats = _review_stats(session)

    return MetricsOut(
        model_name=latest[0].model_name,
        model_version=latest_version,
        is_demonstration=is_demo,
        labels=list(LABELS),
        per_class=per_class,
        macro_f1=aggregates.get("macro_f1"),
        accuracy=aggregates.get("accuracy"),
        micro_f1=aggregates.get("micro_f1"),
        confusion_matrix=aggregates.get("confusion_matrix", {"labels": list(LABELS), "matrix": []}),
        test_set_size=aggregates.get("test_set_size"),
        retrieval_recall_at_k=aggregates.get("retrieval_recall_at_k", {}),
        human_review=review_stats,
    )


def _empty_metrics() -> MetricsOut:
    return MetricsOut(
        model_name="relationship-classifier",
        model_version="unavailable",
        is_demonstration=True,
        labels=list(LABELS),
        per_class=[
            {"label": label, "precision": None, "recall": None, "f1": None, "support": None}
            for label in LABELS
        ],
        macro_f1=None,
        accuracy=None,
        micro_f1=None,
        confusion_matrix={"labels": list(LABELS), "matrix": []},
        test_set_size=None,
        retrieval_recall_at_k={},
        human_review={"note": "No metrics have been imported yet."},
    )


def _load_aggregates(session: Session, version: str) -> dict:
    """Aggregate metrics are stored on a synthetic 'ALL' row's context blob."""
    from ..models import AuditLog

    entry = session.scalars(
        select(AuditLog)
        .where(AuditLog.action == "metrics.imported", AuditLog.entity_id == version)
        .order_by(AuditLog.created_at.desc())
    ).first()
    if entry is None:
        return {}
    try:
        return json.loads(entry.context)
    except (json.JSONDecodeError, TypeError):
        return {}


def _review_stats(session: Session) -> dict:
    total_findings = session.scalar(select(func.count(Finding.id))) or 0
    reviewed = session.scalar(
        select(func.count(Finding.id)).where(Finding.review_status != "pending")
    ) or 0
    decisions = dict(
        session.execute(
            select(Review.decision, func.count(Review.id)).group_by(Review.decision)
        ).all()
    )
    return {
        "findings_total": total_findings,
        "findings_reviewed": reviewed,
        "review_rate": round(reviewed / total_findings, 4) if total_findings else 0.0,
        "decisions": decisions,
    }


@router.get("/dashboard", response_model=DashboardOut)
def get_dashboard(
    session: Session = Depends(get_session),
    queue_limit: int = Query(default=8, ge=1, le=50),
) -> DashboardOut:
    """Counts and lists are computed from stored rows, never hardcoded."""
    total_documents = session.scalar(select(func.count(Document.id))) or 0
    total_analyses = session.scalar(select(func.count(Analysis.id))) or 0
    total_findings = session.scalar(select(func.count(Finding.id))) or 0
    pending_review = session.scalar(
        select(func.count(Finding.id)).where(Finding.requires_review.is_(True))
    ) or 0
    rights_flagged = session.scalar(
        select(func.count(Finding.id)).where(Finding.rights_tags != "[]")
    ) or 0
    failed_analyses = session.scalar(
        select(func.count(Analysis.id)).where(Analysis.status == "failed")
    ) or 0
    active_analyses = session.scalar(
        select(func.count(Analysis.id)).where(Analysis.status.in_(("queued", "processing")))
    ) or 0

    health_rows = dict(
        session.execute(select(Finding.health_category, func.count(Finding.id)).group_by(Finding.health_category)).all()
    )
    health_breakdown = {
        key: health_rows.get(key, 0)
        for key in ("clear", "needs_review", "safeguard_removed", "direct_conflict")
    }

    rights_breakdown = {"article_14": 0, "article_19": 0, "article_21": 0}
    for finding in session.scalars(select(Finding).where(Finding.rights_tags != "[]")):
        try:
            tags = json.loads(finding.rights_tags)
        except (json.JSONDecodeError, TypeError):
            tags = []
        for tag in tags:
            if tag in rights_breakdown:
                rights_breakdown[tag] += 1

    recent_documents = [
        DocumentSummary.model_validate(d)
        for d in session.scalars(select(Document).order_by(Document.created_at.desc()).limit(6))
    ]
    recent_analyses = [
        AnalysisOut.model_validate(a)
        for a in session.scalars(select(Analysis).order_by(Analysis.created_at.desc()).limit(6))
    ]
    queue_rows = list(
        session.scalars(
            select(Finding)
            .options(selectinload(Finding.clause))
            .where(Finding.requires_review.is_(True))
            .order_by(Finding.created_at.desc())
            .limit(queue_limit)
        )
    )

    return DashboardOut(
        counts={
            "documents": total_documents,
            "analyses": total_analyses,
            "findings": total_findings,
            "pending_review": pending_review,
            "rights_flagged": rights_flagged,
            "failed_analyses": failed_analyses,
            "active_analyses": active_analyses,
        },
        health_breakdown=health_breakdown,
        rights_breakdown=rights_breakdown,
        recent_documents=recent_documents,
        recent_analyses=recent_analyses,
        review_queue=[finding_summary(f) for f in queue_rows],
    )
