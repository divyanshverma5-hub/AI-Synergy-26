"""Analysis provider contract.

A provider owns pipeline stages 3-5:

    3. retrieval of relevant existing legal provisions
    4. four-class relationship classification
    5. explanation generation and rights tagging

Stages 1 (PDF extraction) and 2 (clause splitting) happen before a provider is
called, and stage 6 (human review + audit) happens after. A provider therefore
receives clauses plus a database session (for retrieval) and returns finding
drafts. Nothing in the frontend or the API layer depends on which provider is
active, so `MockAnalysisProvider` and `RealAnalysisProvider` are interchangeable
via the ANALYSIS_PROVIDER environment variable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from sqlalchemy.orm import Session

from ..models import Clause

LABELS = ("conflicts", "removes_safeguard", "consistent", "unrelated")


@dataclass
class EvidenceDraft:
    kind: str
    snippet: str
    source_title: str
    source_section: str | None = None
    source_reference: str | None = None
    source_url: str | None = None
    retrieval_score: float | None = None
    is_demonstration: bool = True


@dataclass
class FindingDraft:
    """One clause-level relationship, in the shared JSON shape (docs/SCHEMA.md)."""

    clause_id: str
    predicted_label: str
    confidence: float | None = None
    explanation: str = ""
    rights_tags: list[str] = field(default_factory=list)
    requires_review: bool = True
    evidence_sufficient: bool = True
    implications: dict[str, Any] = field(default_factory=dict)
    provision_id: str | None = None
    evidence: list[EvidenceDraft] = field(default_factory=list)

    def __post_init__(self) -> None:
        if self.predicted_label not in LABELS:
            raise ValueError(f"unknown predicted_label: {self.predicted_label!r}")


@dataclass
class ProviderResult:
    findings: list[FindingDraft]
    provider: str
    is_demonstration: bool
    notes: str | None = None


class AnalysisProvider(Protocol):
    name: str
    is_demonstration: bool

    def analyze(self, clauses: list[Clause], session: Session) -> ProviderResult: ...


def get_provider(name: str) -> "AnalysisProvider":
    """Factory resolving a provider name to an implementation.

    // TODO(ML-INTEGRATION): the "real" branch returns the teammates' provider.
    """
    normalised = (name or "mock").strip().lower()
    if normalised == "real":
        from .real import RealAnalysisProvider

        return RealAnalysisProvider()
    from .mock import MockAnalysisProvider

    return MockAnalysisProvider()
