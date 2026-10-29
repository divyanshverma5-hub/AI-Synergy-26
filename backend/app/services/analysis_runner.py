"""Analysis job orchestration.

Runs the six pipeline stages and persists the outcome:

    1. PDF text extraction       (done at upload time; see services/pdf_extract.py)
    2. Clause splitting          (done at upload time; see services/clauses.py)
    3. Provision retrieval       \\ handled by the active provider
    4. Relationship classification |
    5. Explanation + rights tagging/
    6. Human review + audit      (services/review.py, services/audit.py)

// SIMULATED JOB: jobs run on an in-process thread pool with status written to
// the database. Replace with a real queue (Celery / RQ / Arq) when throughput
// matters; the API contract - queued -> processing -> completed|failed - stays
// the same, so no frontend changes are needed.
"""

from __future__ import annotations

import json
import logging
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from sqlalchemy import select

from ..config import ANALYSIS_PROVIDER
from ..db import session_scope
from ..models import Analysis, Clause, Document, Evidence, Finding
from ..providers import get_provider
from . import audit
from .health import health_category_for

logger = logging.getLogger(__name__)

_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="analysis")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_analysis(document_id: str, provider_name: str | None = None) -> Analysis:
    """Create a queued analysis row for a document."""
    with session_scope() as session:
        document = session.get(Document, document_id)
        if document is None:
            raise LookupError("document not found")
        clause_count = len(
            list(session.scalars(select(Clause.id).where(Clause.document_id == document_id)))
        )
        provider = (provider_name or ANALYSIS_PROVIDER or "mock").lower()
        analysis = Analysis(
            document_id=document_id,
            status="queued",
            provider=provider,
            progress=0,
            clause_count=clause_count,
            is_demonstration=provider == "mock",
        )
        session.add(analysis)
        session.flush()
        audit.record(
            session,
            action="analysis.created",
            entity_type="analysis",
            entity_id=analysis.id,
            previous_value=None,
            new_value={"status": "queued", "provider": provider},
            reason="Analysis job queued",
            context={"document_id": document_id, "clause_count": clause_count},
        )
        return analysis


def submit(analysis_id: str) -> None:
    """Queue an analysis for background execution."""
    _EXECUTOR.submit(_run, analysis_id)


def _run(analysis_id: str) -> None:
    try:
        _mark(analysis_id, status="processing", progress=10)
        with session_scope() as session:
            analysis = session.get(Analysis, analysis_id)
            if analysis is None:
                return
            provider_name = analysis.provider or ANALYSIS_PROVIDER
            document = session.get(Document, analysis.document_id)
            if document is None:
                raise RuntimeError("document no longer exists")
            clauses = list(
                session.scalars(
                    select(Clause)
                    .where(Clause.document_id == document.id)
                    .order_by(Clause.ordinal)
                )
            )
            if not clauses:
                raise RuntimeError("document has no extracted clauses to analyse")

        _mark(analysis_id, progress=35)
        provider = get_provider(provider_name)
        with session_scope() as session:
            clauses = list(
                session.scalars(
                    select(Clause).where(Clause.document_id == document.id).order_by(Clause.ordinal)
                )
            )
            result = provider.analyze(clauses, session)

        _mark(analysis_id, progress=75)
        _persist(analysis_id, result)
        _mark(analysis_id, status="completed", progress=100, error=None)
    except Exception as exc:  # noqa: BLE001 - failure must be recorded, not swallowed
        logger.exception("Analysis %s failed", analysis_id)
        message = f"{type(exc).__name__}: {exc}"
        if not isinstance(exc, RuntimeError):
            message = f"{message}\n{traceback.format_exc(limit=3)}"
        _mark(analysis_id, status="failed", error=message[:4000])


def _persist(analysis_id: str, result) -> None:
    with session_scope() as session:
        analysis = session.get(Analysis, analysis_id)
        if analysis is None:
            return
        # Re-running an analysis replaces its findings so results never mix runs.
        for existing in list(
            session.scalars(select(Finding).where(Finding.analysis_id == analysis_id))
        ):
            session.delete(existing)
        session.flush()

        valid_clause_ids = {
            c.id for c in session.scalars(select(Clause).where(Clause.document_id == analysis.document_id))
        }
        created = 0
        for draft in result.findings:
            if draft.clause_id not in valid_clause_ids:
                logger.warning("Provider returned unknown clause_id %s; skipping", draft.clause_id)
                continue
            finding = Finding(
                analysis_id=analysis_id,
                document_id=analysis.document_id,
                clause_id=draft.clause_id,
                provision_id=draft.provision_id,
                predicted_label=draft.predicted_label,
                confidence=draft.confidence,
                explanation=draft.explanation,
                review_status="pending",
                rights_tags=json.dumps(draft.rights_tags),
                requires_review=draft.requires_review,
                evidence_sufficient=draft.evidence_sufficient,
                implications=json.dumps(draft.implications, default=str),
            )
            finding.health_category = health_category_for(finding)
            session.add(finding)
            session.flush()
            for draft_evidence in draft.evidence:
                session.add(
                    Evidence(
                        finding_id=finding.id,
                        kind=draft_evidence.kind,
                        snippet=draft_evidence.snippet,
                        source_title=draft_evidence.source_title,
                        source_section=draft_evidence.source_section,
                        source_reference=draft_evidence.source_reference,
                        source_url=draft_evidence.source_url,
                        retrieval_score=draft_evidence.retrieval_score,
                        is_demonstration=draft_evidence.is_demonstration,
                    )
                )
            created += 1

        analysis.finding_count = created
        analysis.clause_count = len(valid_clause_ids)
        analysis.is_demonstration = result.is_demonstration
        analysis.finished_at = _now()
        document = session.get(Document, analysis.document_id)
        if document is not None and document.status == "uploaded":
            document.status = "analysed"
        audit.record(
            session,
            action="analysis.findings_persisted",
            entity_type="analysis",
            entity_id=analysis_id,
            new_value={"finding_count": created},
            reason="Provider returned findings",
            context={"provider": result.provider, "notes": result.notes},
        )


def _mark(
    analysis_id: str,
    *,
    status: str | None = None,
    progress: int | None = None,
    error: str | None = None,
) -> None:
    with session_scope() as session:
        analysis = session.get(Analysis, analysis_id)
        if analysis is None:
            return
        previous = {"status": analysis.status, "progress": analysis.progress}
        if status is not None:
            analysis.status = status
            if status == "processing" and analysis.started_at is None:
                analysis.started_at = _now()
            if status in {"completed", "failed"}:
                analysis.finished_at = _now()
        if progress is not None:
            analysis.progress = progress
        if error is not None or status == "completed":
            analysis.error = error
        audit.record(
            session,
            action=f"analysis.{status or 'progress'}",
            entity_type="analysis",
            entity_id=analysis_id,
            previous_value=previous,
            new_value={"status": analysis.status, "progress": analysis.progress},
            reason=error,
        )


def wait_for(analysis_id: str, timeout: float = 30.0) -> Analysis | None:
    """Block until an analysis leaves queued/processing. Used by tests."""
    import time

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with session_scope() as session:
            analysis = session.get(Analysis, analysis_id)
            if analysis is None:
                return None
            if analysis.status in {"completed", "failed"}:
                session.expunge(analysis)
                return analysis
        time.sleep(0.1)
    with session_scope() as session:
        analysis = session.get(Analysis, analysis_id)
        if analysis is not None:
            session.expunge(analysis)
        return analysis
