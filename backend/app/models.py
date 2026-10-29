"""Database schema.

Table map
---------
documents    uploaded bills / proposed laws (real or demonstration)
clauses      clauses split out of a document, in reading order
provisions   existing legal provisions used as the comparison corpus
analyses     one analysis job per document run
findings     one row per clause relationship produced by an analysis
evidence     source-linked evidence rows attached to a finding
reviews      immutable reviewer decisions (history is preserved)
audit_logs   append-only trail of every state change
model_metrics per-class evaluation metrics for the classifier

Vocabulary is deliberately shared with the analysis JSON schema documented in
docs/SCHEMA.md: labels are `conflicts`, `removes_safeguard`, `consistent`,
`unrelated`; review statuses are `pending`, `confirmed`, `rejected`,
`relabelled`, `insufficient_evidence`.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

PREDICTED_LABELS = ("conflicts", "removes_safeguard", "consistent", "unrelated")
REVIEW_STATUSES = ("pending", "confirmed", "rejected", "relabelled", "insufficient_evidence")
JOB_STATUSES = ("queued", "processing", "completed", "failed")
HEALTH_CATEGORIES = ("clear", "needs_review", "safeguard_removed", "direct_conflict")
RIGHTS_ARTICLES = ("article_14", "article_19", "article_21")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return uuid.uuid4().hex


class Base(DeclarativeBase):
    pass


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    filename: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    content_type: Mapped[str] = mapped_column(String(128), nullable=False, default="application/pdf")
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False, default="")
    file_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="uploaded")
    text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    page_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    extraction_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Demonstration rows are flagged so the UI can never present them as real law.
    is_demonstration: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Versioning / legal metadata. Kept nullable: unknown must stay unknown.
    version_label: Mapped[str | None] = mapped_column(String(64), nullable=True)
    document_date: Mapped[str | None] = mapped_column(String(64), nullable=True)
    legal_status: Mapped[str | None] = mapped_column(String(128), nullable=True)
    source_reference: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    clauses: Mapped[list["Clause"]] = relationship(
        back_populates="document", cascade="all, delete-orphan", order_by="Clause.ordinal"
    )
    analyses: Mapped[list["Analysis"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )


class Clause(Base):
    __tablename__ = "clauses"
    __table_args__ = (UniqueConstraint("document_id", "ordinal", name="uq_clause_doc_ordinal"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    section_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    heading: Mapped[str | None] = mapped_column(String(512), nullable=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    char_start: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    char_end: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    document: Mapped[Document] = relationship(back_populates="clauses")


class Provision(Base):
    """An existing legal provision from the comparison corpus.

    Seeded rows are demonstration material and are labelled as such; the real
    retrieval pipeline replaces them (see docs/ML_INTEGRATION.md).
    """

    __tablename__ = "provisions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    act_title: Mapped[str] = mapped_column(String(512), nullable=False)
    section_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    heading: Mapped[str | None] = mapped_column(String(512), nullable=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    legal_status: Mapped[str | None] = mapped_column(String(128), nullable=True)
    document_date: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source_reference: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_demonstration: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="queued")
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="mock")
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_demonstration: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    clause_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    finding_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    document: Mapped[Document] = relationship(back_populates="analyses")
    findings: Mapped[list["Finding"]] = relationship(
        back_populates="analysis", cascade="all, delete-orphan"
    )


class Finding(Base):
    __tablename__ = "findings"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    analysis_id: Mapped[str] = mapped_column(ForeignKey("analyses.id", ondelete="CASCADE"), index=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    clause_id: Mapped[str] = mapped_column(ForeignKey("clauses.id", ondelete="CASCADE"), index=True)
    provision_id: Mapped[str | None] = mapped_column(
        ForeignKey("provisions.id", ondelete="SET NULL"), nullable=True
    )

    predicted_label: Mapped[str] = mapped_column(String(32), nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Current human-decided label; NULL until a reviewer acts.
    effective_label: Mapped[str | None] = mapped_column(String(32), nullable=True)
    review_status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    health_category: Mapped[str] = mapped_column(String(32), nullable=False, default="needs_review")
    rights_tags: Mapped[str] = mapped_column(Text, nullable=False, default="[]")  # JSON list
    requires_review: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    evidence_sufficient: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    implications: Mapped[str] = mapped_column(Text, nullable=False, default="{}")  # JSON object
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    analysis: Mapped[Analysis] = relationship(back_populates="findings")
    clause: Mapped[Clause] = relationship()
    provision: Mapped[Provision | None] = relationship()
    evidence: Mapped[list["Evidence"]] = relationship(
        back_populates="finding", cascade="all, delete-orphan"
    )
    reviews: Mapped[list["Review"]] = relationship(
        back_populates="finding", cascade="all, delete-orphan", order_by="Review.created_at"
    )


class Evidence(Base):
    __tablename__ = "evidence"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    finding_id: Mapped[str] = mapped_column(ForeignKey("findings.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(64), nullable=False, default="text_span")
    snippet: Mapped[str] = mapped_column(Text, nullable=False, default="")
    source_title: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    source_section: Mapped[str | None] = mapped_column(String(128), nullable=True)
    source_reference: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    retrieval_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_demonstration: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    finding: Mapped[Finding] = relationship(back_populates="evidence")


class Review(Base):
    """Append-only reviewer decision. Rows are never updated or deleted."""

    __tablename__ = "reviews"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    finding_id: Mapped[str] = mapped_column(ForeignKey("findings.id", ondelete="CASCADE"), index=True)
    reviewer: Mapped[str] = mapped_column(String(128), nullable=False, default="anonymous")
    decision: Mapped[str] = mapped_column(String(32), nullable=False)  # confirm|reject|relabel|insufficient_evidence
    previous_label: Mapped[str | None] = mapped_column(String(32), nullable=True)
    updated_label: Mapped[str | None] = mapped_column(String(32), nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False, default="")
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    is_usable_for_training: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    finding: Mapped[Finding] = relationship(back_populates="reviews")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    actor: Mapped[str] = mapped_column(String(128), nullable=False, default="system")
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    previous_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    context: Mapped[str] = mapped_column(Text, nullable=False, default="{}")  # JSON object
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class ModelMetric(Base):
    """Classifier evaluation metrics.

    Populated from a real evaluation report when one is available. Until then
    the seeded rows are demonstration values (see docs/METRICS.md).
    """

    __tablename__ = "model_metrics"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    model_name: Mapped[str] = mapped_column(String(128), nullable=False, default="relationship-classifier")
    model_version: Mapped[str] = mapped_column(String(64), nullable=False, default="demo-0.1")
    label: Mapped[str] = mapped_column(String(32), nullable=False)
    precision: Mapped[float | None] = mapped_column(Float, nullable=True)
    recall: Mapped[float | None] = mapped_column(Float, nullable=True)
    f1: Mapped[float | None] = mapped_column(Float, nullable=True)
    support: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_demonstration: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
