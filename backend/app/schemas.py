"""Pydantic request/response schemas.

These mirror the shared JSON schema in docs/SCHEMA.md. The ML provider emits
exactly these field names, which is what lets the mock and real providers be
swapped without touching the frontend.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

PredictedLabel = Literal["conflicts", "removes_safeguard", "consistent", "unrelated"]
ReviewStatus = Literal["pending", "confirmed", "rejected", "relabelled", "insufficient_evidence"]
HealthCategory = Literal["clear", "needs_review", "safeguard_removed", "direct_conflict"]
JobStatus = Literal["queued", "processing", "completed", "failed"]
ReviewDecision = Literal["confirm", "reject", "relabel", "insufficient_evidence"]
RightsArticle = Literal["article_14", "article_19", "article_21"]


class EvidenceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    finding_id: str
    kind: str
    snippet: str
    source_title: str
    source_section: str | None = None
    source_reference: str | None = None
    source_url: str | None = None
    retrieval_score: float | None = None
    is_demonstration: bool = True


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    finding_id: str
    reviewer: str
    decision: str
    previous_label: str | None = None
    updated_label: str | None = None
    reason: str
    notes: str
    is_usable_for_training: bool
    created_at: datetime


class ClauseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    document_id: str
    ordinal: int
    section_id: str | None = None
    heading: str | None = None
    text: str
    page_number: int | None = None
    char_start: int
    char_end: int


class DocumentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    filename: str
    status: str
    page_count: int
    file_size: int
    is_demonstration: bool
    version_label: str | None = None
    document_date: str | None = None
    legal_status: str | None = None
    source_reference: str | None = None
    created_at: datetime


class DocumentDetail(DocumentSummary):
    text: str
    extraction_error: str | None = None
    content_type: str
    clause_count: int = 0
    analysis_count: int = 0


class ClauseWithDocument(ClauseOut):
    document_title: str | None = None


class FindingSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    analysis_id: str
    document_id: str
    clause_id: str
    provision_id: str | None = None
    predicted_label: str
    effective_label: str | None = None
    confidence: float | None = None
    explanation: str | None = None
    review_status: str
    health_category: str
    rights_tags: list[str] = Field(default_factory=list)
    requires_review: bool
    evidence_sufficient: bool
    implications: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class FindingDetail(FindingSummary):
    clause: ClauseOut | None = None
    provision: dict[str, Any] | None = None
    evidence: list[EvidenceOut] = Field(default_factory=list)
    reviews: list[ReviewOut] = Field(default_factory=list)
    document_title: str | None = None


class AnalysisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    document_id: str
    status: str
    provider: str
    progress: int
    error: str | None = None
    is_demonstration: bool
    clause_count: int
    finding_count: int
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime


class AnalysisResults(BaseModel):
    analysis: AnalysisOut
    document: DocumentSummary
    counts: dict[str, int]
    findings: list[FindingDetail]


class AnalysisCreate(BaseModel):
    document_id: str = Field(min_length=1, max_length=32)
    # Optional override; the server default comes from ANALYSIS_PROVIDER.
    provider: Literal["mock", "real"] | None = None
    force: bool = False


class ReviewCreate(BaseModel):
    finding_id: str = Field(min_length=1, max_length=32)
    decision: ReviewDecision
    updated_label: PredictedLabel | None = None
    reason: str = Field(default="", max_length=4000)
    notes: str = Field(default="", max_length=4000)
    reviewer: str = Field(default="reviewer", max_length=128)
    is_usable_for_training: bool = True

    @model_validator(mode="after")
    def _validate_decision_payload(self) -> "ReviewCreate":
        self.reviewer = self.reviewer.strip() or "reviewer"
        # A relabel, rejection or insufficient-evidence call must carry a reason
        # so the audit trail records why the model output was overridden.
        if self.decision in {"relabel", "reject", "insufficient_evidence"} and not self.reason.strip():
            raise ValueError(f"reason is required when decision is '{self.decision}'")
        if self.decision == "relabel" and not self.updated_label:
            raise ValueError("updated_label is required when decision is 'relabel'")
        return self


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    actor: str
    action: str
    entity_type: str
    entity_id: str
    previous_value: str | None = None
    new_value: str | None = None
    reason: str | None = None
    context: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class MetricsOut(BaseModel):
    model_name: str
    model_version: str
    is_demonstration: bool
    labels: list[str]
    per_class: list[dict[str, Any]]
    macro_f1: float | None = None
    accuracy: float | None = None
    micro_f1: float | None = None
    confusion_matrix: dict[str, Any]
    test_set_size: int | None = None
    retrieval_recall_at_k: dict[str, Any]
    human_review: dict[str, Any]


class PaginatedFindings(BaseModel):
    items: list[FindingDetail]
    total: int
    page: int
    page_size: int
    pages: int


class PaginatedReviews(BaseModel):
    items: list[ReviewOut]
    total: int
    page: int
    page_size: int
    pages: int


class PaginatedAudit(BaseModel):
    items: list[AuditLogOut]
    total: int
    page: int
    page_size: int
    pages: int


class DashboardOut(BaseModel):
    counts: dict[str, int]
    health_breakdown: dict[str, int]
    rights_breakdown: dict[str, int]
    recent_documents: list[DocumentSummary]
    recent_analyses: list[AnalysisOut]
    review_queue: list[FindingSummary]
