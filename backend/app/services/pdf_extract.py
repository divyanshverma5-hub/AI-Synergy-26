"""Stage 1 of the analysis pipeline: PDF text extraction.

Kept deliberately separate from clause splitting and from the analysis
provider so each stage can be replaced independently.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from io import BytesIO

from pypdf import PdfReader
from pypdf.errors import PdfReadError

logger = logging.getLogger(__name__)


class ExtractionError(Exception):
    """Raised when a PDF cannot be turned into usable text."""


@dataclass
class ExtractedPage:
    page_number: int
    text: str


@dataclass
class ExtractionResult:
    text: str
    page_count: int
    pages: list[ExtractedPage] = field(default_factory=list)


def extract_pdf(data: bytes) -> ExtractionResult:
    """Extract text from PDF bytes, preserving per-page boundaries.

    Raises ExtractionError with a human-readable message on failure so the API
    can return a 422 rather than a stack trace.
    """
    if not data:
        raise ExtractionError("Uploaded file is empty.")

    try:
        reader = PdfReader(BytesIO(data))
    except PdfReadError as exc:
        raise ExtractionError(f"Could not read PDF: {exc}") from exc
    except Exception as exc:  # pragma: no cover - defensive
        raise ExtractionError(f"Unexpected error reading PDF: {exc}") from exc

    if getattr(reader, "is_encrypted", False):
        # Many bills are published with an owner password but no user password.
        try:
            reader.decrypt("")
        except Exception as exc:
            raise ExtractionError("PDF is encrypted and could not be opened.") from exc

    pages: list[ExtractedPage] = []
    for index, page in enumerate(reader.pages, start=1):
        try:
            raw = page.extract_text() or ""
        except Exception as exc:  # pragma: no cover - malformed page
            logger.warning("Failed to extract page %s: %s", index, exc)
            raw = ""
        pages.append(ExtractedPage(page_number=index, text=_normalise(raw)))

    text = "\n".join(p.text for p in pages).strip()
    if not text:
        raise ExtractionError(
            "No selectable text found. The PDF may be a scan; OCR is not enabled in this build."
        )

    return ExtractionResult(text=text, page_count=len(pages), pages=pages)


def _normalise(raw: str) -> str:
    """Tidy whitespace while keeping line structure used by clause splitting."""
    lines = [line.rstrip() for line in raw.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    cleaned: list[str] = []
    blank_run = 0
    for line in lines:
        if line.strip():
            blank_run = 0
            cleaned.append(line)
        else:
            blank_run += 1
            if blank_run == 1:
                cleaned.append("")
    return "\n".join(cleaned).strip()
