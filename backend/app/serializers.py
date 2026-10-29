"""Shared helpers for turning ORM rows into API responses."""

from __future__ import annotations

import json
from typing import Any

from .models import Clause, Evidence, Finding, Provision, Review
from .schemas import (
    ClauseOut,
    EvidenceOut,
    FindingDetail,
    FindingSummary,
    ReviewOut,
)


def _json_load(raw: str | None, default: Any) -> Any:
    if not raw:
        return default
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return default


def finding_summary(finding: Finding) -> FindingSummary:
    return FindingSummary(
        id=finding.id,
        analysis_id=finding.analysis_id,
        document_id=finding.document_id,
        clause_id=finding.clause_id,
        provision_id=finding.provision_id,
        predicted_label=finding.predicted_label,
        effective_label=finding.effective_label,
        confidence=finding.confidence,
        explanation=finding.explanation,
        review_status=finding.review_status,
        health_category=finding.health_category,
        rights_tags=_json_load(finding.rights_tags, []),
        requires_review=finding.requires_review,
        evidence_sufficient=finding.evidence_sufficient,
        implications=_json_load(finding.implications, {}),
        created_at=finding.created_at,
    )


def provision_dict(provision: Provision | None) -> dict[str, Any] | None:
    if provision is None:
        return None
    return {
        "id": provision.id,
        "act_title": provision.act_title,
        "section_id": provision.section_id,
        "heading": provision.heading,
        "text": provision.text,
        "legal_status": provision.legal_status,
        "document_date": provision.document_date,
        "source_reference": provision.source_reference,
        "source_url": provision.source_url,
        "is_demonstration": provision.is_demonstration,
    }


def finding_detail(finding: Finding, document_title: str | None = None) -> FindingDetail:
    base = finding_summary(finding)
    clause = finding.clause
    return FindingDetail(
        **base.model_dump(),
        clause=ClauseOut.model_validate(clause) if clause else None,
        provision=provision_dict(finding.provision),
        evidence=[EvidenceOut.model_validate(e) for e in finding.evidence],
        reviews=[ReviewOut.model_validate(r) for r in finding.reviews],
        document_title=document_title,
    )


def clause_out(clause: Clause) -> ClauseOut:
    return ClauseOut.model_validate(clause)


def evidence_out(evidence: Evidence) -> EvidenceOut:
    return EvidenceOut.model_validate(evidence)


def review_out(review: Review) -> ReviewOut:
    return ReviewOut.model_validate(review)
