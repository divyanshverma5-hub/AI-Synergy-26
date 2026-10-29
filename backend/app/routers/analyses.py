"""Analysis job endpoints and finding retrieval."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..db import get_session
from ..models import Analysis, Clause, Document, Finding
from ..schemas import (
    AnalysisCreate,
    AnalysisOut,
    AnalysisResults,
    DocumentSummary,
    FindingDetail,
    FindingSummary,
    PaginatedFindings,
)
from ..serializers import finding_detail, finding_summary
from ..services import analysis_runner

router = APIRouter(prefix="/api", tags=["analyses"])


@router.post("/analyses", response_model=AnalysisOut, status_code=202)
def create_analysis(
    payload: AnalysisCreate, session: Session = Depends(get_session)
) -> AnalysisOut:
    document = session.get(Document, payload.document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    clause_count = session.scalar(
        select(func.count(Clause.id)).where(Clause.document_id == document.id)
    )
    if not clause_count:
        raise HTTPException(
            status_code=422, detail="Document has no extracted clauses; re-upload the PDF."
        )

    if not payload.force:
        active = session.scalars(
            select(Analysis).where(
                Analysis.document_id == document.id,
                Analysis.status.in_(("queued", "processing")),
            )
        ).first()
        if active is not None:
            raise HTTPException(
                status_code=409,
                detail=f"An analysis is already {active.status} for this document (id {active.id}).",
            )

    try:
        analysis = analysis_runner.create_analysis(document.id, payload.provider)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Document not found.") from exc

    analysis_runner.submit(analysis.id)
    return AnalysisOut.model_validate(analysis)


@router.get("/analyses", response_model=list[AnalysisOut])
def list_analyses(
    session: Session = Depends(get_session),
    document_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[AnalysisOut]:
    stmt = select(Analysis).order_by(Analysis.created_at.desc())
    if document_id:
        stmt = stmt.where(Analysis.document_id == document_id)
    if status:
        stmt = stmt.where(Analysis.status == status)
    stmt = stmt.offset(offset).limit(limit)
    return [AnalysisOut.model_validate(a) for a in session.scalars(stmt)]


@router.get("/analyses/{analysis_id}", response_model=AnalysisOut)
def get_analysis(analysis_id: str, session: Session = Depends(get_session)) -> AnalysisOut:
    analysis = session.get(Analysis, analysis_id)
    if analysis is None:
        raise HTTPException(status_code=404, detail="Analysis not found.")
    return AnalysisOut.model_validate(analysis)


@router.get("/analyses/{analysis_id}/results", response_model=AnalysisResults)
def get_results(analysis_id: str, session: Session = Depends(get_session)) -> AnalysisResults:
    analysis = session.get(Analysis, analysis_id)
    if analysis is None:
        raise HTTPException(status_code=404, detail="Analysis not found.")
    document = session.get(Document, analysis.document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    findings = list(
        session.scalars(
            select(Finding)
            .options(
                selectinload(Finding.clause),
                selectinload(Finding.provision),
                selectinload(Finding.evidence),
                selectinload(Finding.reviews),
            )
            .where(Finding.analysis_id == analysis_id)
            .join(Clause, Clause.id == Finding.clause_id)
            .order_by(Clause.ordinal)
        )
    )
    counts = {
        "total": len(findings),
        "conflicts": sum(1 for f in findings if (f.effective_label or f.predicted_label) == "conflicts"),
        "removes_safeguard": sum(
            1 for f in findings if (f.effective_label or f.predicted_label) == "removes_safeguard"
        ),
        "consistent": sum(1 for f in findings if (f.effective_label or f.predicted_label) == "consistent"),
        "unrelated": sum(1 for f in findings if (f.effective_label or f.predicted_label) == "unrelated"),
        "requires_review": sum(1 for f in findings if f.requires_review),
        "pending": sum(1 for f in findings if f.review_status == "pending"),
        "clear": sum(1 for f in findings if f.health_category == "clear"),
        "needs_review": sum(1 for f in findings if f.health_category == "needs_review"),
        "safeguard_removed": sum(1 for f in findings if f.health_category == "safeguard_removed"),
        "direct_conflict": sum(1 for f in findings if f.health_category == "direct_conflict"),
    }
    return AnalysisResults(
        analysis=AnalysisOut.model_validate(analysis),
        document=DocumentSummary.model_validate(document),
        counts=counts,
        findings=[finding_detail(f, document.title) for f in findings],
    )


@router.get("/findings", response_model=PaginatedFindings)
def list_findings(
    session: Session = Depends(get_session),
    document_id: str | None = Query(default=None),
    analysis_id: str | None = Query(default=None),
    label: str | None = Query(default=None),
    review_status: str | None = Query(default=None),
    health_category: str | None = Query(default=None),
    rights_tag: str | None = Query(default=None),
    requires_review: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
) -> PaginatedFindings:
    """Paginated, filterable finding list backing the review queue and explorer."""
    stmt = select(Finding)
    if document_id:
        stmt = stmt.where(Finding.document_id == document_id)
    if analysis_id:
        stmt = stmt.where(Finding.analysis_id == analysis_id)
    if label:
        stmt = stmt.where(
            func.coalesce(Finding.effective_label, Finding.predicted_label) == label
        )
    if review_status:
        stmt = stmt.where(Finding.review_status == review_status)
    if health_category:
        stmt = stmt.where(Finding.health_category == health_category)
    if requires_review is not None:
        stmt = stmt.where(Finding.requires_review.is_(requires_review))
    if rights_tag:
        stmt = stmt.where(Finding.rights_tags.like(f'%"{rights_tag}"%'))

    total = session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        session.scalars(
            stmt.options(
                selectinload(Finding.clause),
                selectinload(Finding.provision),
                selectinload(Finding.evidence),
                selectinload(Finding.reviews),
            )
            .order_by(Finding.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    titles = {
        d.id: d.title
        for d in session.scalars(
            select(Document).where(Document.id.in_({f.document_id for f in rows} or {""}))
        )
    }
    return PaginatedFindings(
        items=[finding_detail(f, titles.get(f.document_id)) for f in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, (total + page_size - 1) // page_size),
    )


@router.get("/findings/{finding_id}", response_model=FindingDetail)
def get_finding(finding_id: str, session: Session = Depends(get_session)) -> FindingDetail:
    finding = session.scalars(
        select(Finding)
        .options(
            selectinload(Finding.clause),
            selectinload(Finding.provision),
            selectinload(Finding.evidence),
            selectinload(Finding.reviews),
        )
        .where(Finding.id == finding_id)
    ).first()
    if finding is None:
        raise HTTPException(status_code=404, detail="Finding not found.")
    document = session.get(Document, finding.document_id)
    return finding_detail(finding, document.title if document else None)
