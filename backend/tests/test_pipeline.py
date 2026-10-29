"""Unit tests for the document-processing stages (extraction, splitting, diffing)."""

from __future__ import annotations

import pytest

from app.seed.demo_data import _text_to_pdf
from app.services.clauses import split_clauses
from app.services.diffing import diff_segments, highlight_pair, similarity
from app.services.pdf_extract import ExtractionError, extract_pdf

BILL = """THE DEMONSTRATION TEST BILL (FICTIONAL)
A BILL to test clause extraction.

1. Short title and commencement. This Act may be called the Demonstration Test Act (fictional) and it shall come into force on the appointed date.

2. Appeals. No appeal shall lie against an order made under this Act, and the appellate authority shall not be required to give reasons.

3. Fees. The authority may prescribe the fees payable under this Act by notification.
"""


def test_extract_pdf_returns_text_and_page_count():
    pdf = _text_to_pdf("Demonstration Test Bill", BILL)
    result = extract_pdf(pdf)
    assert result.page_count >= 1
    assert "Short title" in result.text
    assert result.pages[0].page_number == 1


def test_extract_pdf_rejects_non_pdf_bytes():
    with pytest.raises(ExtractionError):
        extract_pdf(b"not a pdf at all")


def test_extract_pdf_rejects_empty_input():
    with pytest.raises(ExtractionError):
        extract_pdf(b"")


def test_split_clauses_preserves_section_identifiers():
    clauses = split_clauses(BILL)
    section_ids = [c.section_id for c in clauses]
    assert "1" in section_ids
    assert "2" in section_ids
    assert "3" in section_ids
    ordinals = [c.ordinal for c in clauses]
    assert ordinals == sorted(ordinals)
    assert len(ordinals) == len(set(ordinals))


def test_split_clauses_returns_ordered_text_covering_the_bill():
    clauses = split_clauses(BILL)
    joined = " ".join(c.text for c in clauses)
    assert "No appeal shall lie" in joined
    assert "prescribe the fees" in joined


def test_split_clauses_on_empty_text_is_empty():
    assert split_clauses("") == []
    assert split_clauses("   \n  ") == []


def test_split_clauses_keeps_body_text_that_shares_a_line_with_its_heading():
    """A heading and its first body sentence on one line must not lose the body."""
    text = (
        "2. Registration. Every service provider shall register with the regulator within "
        "sixty days of the commencement of this Act.\n"
        "3. Blocking of content. The regulator may, by order, block access to any content "
        "where it is satisfied that such content is necessary to be blocked.\n"
    )
    clauses = split_clauses(text)
    section_3 = next(c for c in clauses if c.section_id == "3")
    assert "The regulator may, by order, block access" in section_3.text


def test_split_clauses_does_not_drop_a_heading_only_section():
    text = "11. Short title. This Act may be cited as the Test Act.\n12. Penalty\n13. Repeal. The earlier Act is repealed.\n"
    clauses = split_clauses(text)
    joined = " ".join(c.text for c in clauses)
    assert "Penalty" in joined


def test_split_clauses_preserves_every_content_word_of_the_input():
    """No body word may disappear during splitting."""
    text = (
        "1. Short title and commencement. This Act may be called the Test Act and it shall "
        "come into force on the appointed date.\n"
        "2. Appeals. No appeal shall lie against an order made under this Act.\n"
        "3. Fees. The authority may prescribe the fees payable for a licence.\n"
    )
    clauses = split_clauses(text)
    joined = " ".join(c.text for c in clauses)
    for phrase in (
        "may be called the Test Act",
        "No appeal shall lie against an order",
        "may prescribe the fees payable",
    ):
        assert phrase in joined


def test_diff_segments_marks_removal_and_addition():
    old = "the appellant shall have a right to be heard"
    new = "the appellant shall have no right to be heard"
    segments = diff_segments(old, new)
    kinds = {s["type"] for s in segments}
    assert "added" in kinds
    assert "removed" in kinds
    assert any(s["type"] == "equal" for s in segments)


def test_highlight_pair_splits_by_side():
    pair = highlight_pair("appeal shall lie", "no appeal shall lie")
    assert any(s["type"] == "added" for s in pair["new"])
    assert all(s["type"] in {"equal", "removed"} for s in pair["old"])


def test_similarity_bounds():
    assert similarity("same text", "same text") == 1.0
    assert similarity("", "") == 1.0
    assert 0.0 <= similarity("alpha beta", "gamma delta") <= 1.0
