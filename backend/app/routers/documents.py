"""Document endpoints: upload, list, retrieve, clauses, and clause diff."""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..config import ALLOWED_CONTENT_TYPES, MAX_UPLOAD_BYTES, UPLOAD_DIR
from ..db import get_session
from ..models import Analysis, Clause, Document
from ..schemas import ClauseOut, DocumentDetail, DocumentSummary
from ..serializers import provision_dict
from ..services import audit
from ..services.clauses import split_clauses
from ..services.diffing import highlight_pair, similarity
from ..services.pdf_extract import ExtractionError, extract_pdf

router = APIRouter(prefix="/api/documents", tags=["documents"])

_PDF_MAGIC = b"%PDF-"


@router.post("", response_model=DocumentDetail, status_code=201)
def upload_document(
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    version_label: str | None = Form(default=None),
    document_date: str | None = Form(default=None),
    legal_status: str | None = Form(default=None),
    source_reference: str | None = Form(default=None),
    session: Session = Depends(get_session),
) -> DocumentDetail:
    """Validate, store, extract text from, and split a PDF into clauses."""
    filename = file.filename or "upload.pdf"
    content_type = file.content_type or "application/pdf"
    if content_type not in ALLOWED_CONTENT_TYPES and not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=415, detail="Only PDF files are accepted.")
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=415, detail="Only files with a .pdf extension are accepted.")

    data = file.file.read()
    if not data:
        raise HTTPException(status_code=422, detail="Uploaded file is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB upload limit.",
        )
    if not data.startswith(_PDF_MAGIC):
        raise HTTPException(status_code=415, detail="File does not look like a valid PDF.")

    document = Document(
        title=(title or Path(filename).stem or "Untitled bill").strip()[:512],
        filename=filename,
        content_type=content_type,
        file_size=len(data),
        status="uploaded",
        is_demonstration=False,
        version_label=(version_label or None),
        document_date=(document_date or None),
        legal_status=(legal_status or None),
        source_reference=(source_reference or None),
    )

    stored_path = UPLOAD_DIR / f"{document.id}-{uuid.uuid4().hex[:8]}.pdf"
    stored_path.write_bytes(data)
    document.file_path = str(stored_path)

    try:
        extraction = extract_pdf(data)
    except ExtractionError as exc:
        document.status = "extraction_failed"
        document.extraction_error = str(exc)
        session.add(document)
        session.commit()
        audit.record(
            session,
            action="document.extraction_failed",
            entity_type="document",
            entity_id=document.id,
            new_value={"status": "extraction_failed"},
            reason=str(exc),
            context={"filename": filename},
        )
        session.commit()
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    document.text = extraction.text
    document.page_count = extraction.page_count

    page_offsets: list[tuple[int, int, int]] = []
    cursor = 0
    for page in extraction.pages:
        page_offsets.append((page.page_number, cursor, cursor + len(page.text)))
        cursor += len(page.text) + 1

    clauses = split_clauses(extraction.text, page_offsets)
    for split in clauses:
        document.clauses.append(
            Clause(
                ordinal=split.ordinal,
                section_id=split.section_id,
                heading=split.heading,
                text=split.text,
                char_start=split.char_start,
                char_end=split.char_end,
                page_number=split.page_number,
            )
        )
    if not clauses:
        # Text extracted but no clause structure found: keep one clause so the
        # document is still analysable rather than silently unusable.
        document.clauses.append(
            Clause(ordinal=1, section_id=None, heading=None, text=extraction.text,
                   char_start=0, char_end=len(extraction.text), page_number=1)
        )

    session.add(document)
    session.commit()
    session.refresh(document)
    audit.record(
        session,
        action="document.uploaded",
        entity_type="document",
        entity_id=document.id,
        new_value={"status": "uploaded", "clauses": len(document.clauses)},
        reason="PDF uploaded and split into clauses",
        context={"filename": filename, "page_count": extraction.page_count},
    )
    session.commit()

    return _detail(session, document)


@router.get("", response_model=list[DocumentSummary])
def list_documents(
    session: Session = Depends(get_session),
    search: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[DocumentSummary]:
    stmt = select(Document).order_by(Document.created_at.desc())
    if search:
        pattern = f"%{search.lower()}%"
        stmt = stmt.where(func.lower(Document.title).like(pattern))
    stmt = stmt.offset(offset).limit(limit)
    return [DocumentSummary.model_validate(d) for d in session.scalars(stmt)]


@router.get("/{document_id}", response_model=DocumentDetail)
def get_document(document_id: str, session: Session = Depends(get_session)) -> DocumentDetail:
    document = session.get(Document, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    return _detail(session, document)


@router.get("/{document_id}/clauses", response_model=list[ClauseOut])
def get_document_clauses(
    document_id: str, session: Session = Depends(get_session)
) -> list[ClauseOut]:
    if session.get(Document, document_id) is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    clauses = session.scalars(
        select(Clause).where(Clause.document_id == document_id).order_by(Clause.ordinal)
    )
    return [ClauseOut.model_validate(c) for c in clauses]


@router.get("/{document_id}/clauses/{clause_id}/diff")
def clause_diff(
    document_id: str, clause_id: str, session: Session = Depends(get_session)
) -> dict:
    """Side-by-side diff between a clause and its matched earlier provision."""
    clause = session.get(Clause, clause_id)
    if clause is None or clause.document_id != document_id:
        raise HTTPException(status_code=404, detail="Clause not found in this document.")

    from ..models import Finding

    finding = session.scalars(
        select(Finding)
        .options(selectinload(Finding.provision))
        .where(Finding.clause_id == clause_id, Finding.provision_id.isnot(None))
        .order_by(Finding.created_at.desc())
    ).first()
    if finding is None or finding.provision is None:
        raise HTTPException(
            status_code=404,
            detail="No matched earlier provision is available for this clause yet.",
        )

    provision = finding.provision
    segments = highlight_pair(provision.text, clause.text)
    return {
        "clause_id": clause.id,
        "finding_id": finding.id,
        "provision": provision_dict(provision),
        "segments": segments,
        "similarity": round(similarity(provision.text, clause.text), 4),
        "is_demonstration": bool(provision.is_demonstration or finding.analysis.is_demonstration),
    }


def _detail(session: Session, document: Document) -> DocumentDetail:
    clause_count = session.scalar(
        select(func.count(Clause.id)).where(Clause.document_id == document.id)
    )
    analysis_count = session.scalar(
        select(func.count(Analysis.id)).where(Analysis.document_id == document.id)
    )
    base = DocumentSummary.model_validate(document)
    return DocumentDetail(
        **base.model_dump(),
        text=document.text,
        extraction_error=document.extraction_error,
        content_type=document.content_type,
        clause_count=clause_count or 0,
        analysis_count=analysis_count or 0,
    )
