"""Stage 2 of the analysis pipeline: clause / section splitting.

Indian bills follow a recognisable pattern: numbered sections such as
"3. Amendment of section 12." followed by sub-clauses "(1)", "(2)" and clauses
"(a)", "(b)". We split on the top-level section markers and keep the section
identifier with the text so the UI can show "Section 3" next to a finding.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# "3." / "12." / "3A." / "Section 5." at the start of a line.
_SECTION_RE = re.compile(
    r"^(?:section\s+)?(?P<num>\d{1,3}[A-Za-z]{0,2})\s*[.)]\s+(?P<rest>\S.*)$",
    re.IGNORECASE,
)
# "CHAPTER II", "PART A", "SCHEDULE" act as hard boundaries too.
_CHAPTER_RE = re.compile(r"^(chapter|part|schedule)\b.*$", re.IGNORECASE)
_SUBCLAUSE_RE = re.compile(r"^\((?:\d{1,2}|[a-z]{1,2}|[ivx]{1,5})\)\s+")

MIN_CLAUSE_CHARS = 25
MAX_CLAUSE_CHARS = 12000


@dataclass
class SplitClause:
    ordinal: int
    section_id: str | None
    heading: str | None
    text: str
    char_start: int
    char_end: int
    page_number: int | None = None


def split_clauses(
    text: str,
    page_offsets: list[tuple[int, int, int]] | None = None,
) -> list[SplitClause]:
    """Split `text` into ordered clauses.

    `page_offsets` is a list of (page_number, char_start, char_end) used to
    attribute each clause to a page when page information is available.
    """
    if not text.strip():
        return []

    lines = text.split("\n")
    offset = 0
    line_spans: list[tuple[int, int, str]] = []
    for line in lines:
        line_spans.append((offset, offset + len(line), line))
        offset += len(line) + 1  # +1 for the newline consumed by join

    blocks: list[tuple[str | None, str | None, int, int, list[str]]] = []
    current_num: str | None = None
    current_heading: str | None = None
    current_start = 0
    current_lines: list[str] = []

    def flush(end: int) -> None:
        nonlocal current_lines, current_start
        body = "\n".join(current_lines).strip()
        # Keep a block when it has a body OR a heading: a heading-only section
        # (e.g. "12. Penalty") must survive as its own clause.
        if body or current_heading:
            blocks.append(
                (current_num, current_heading, current_start, end, body.split("\n") if body else [])
            )
        current_lines = []

    for start, end, line in line_spans:
        stripped = line.strip()
        match = _SECTION_RE.match(stripped)
        is_boundary = bool(match) or bool(_CHAPTER_RE.match(stripped))
        if is_boundary:
            flush(start)
            if match:
                num = match.group("num")
                rest = match.group("rest").strip()
                current_heading, current_body = _split_heading(rest)
                current_num = num
                current_lines = [current_body] if current_body else []
                current_start = start
                continue
            # Chapter / schedule heading: keep as its own context line.
            current_num = None
            current_heading = stripped
            current_lines = [stripped]
            current_start = start
            continue

        if not current_lines and current_num is None and not current_heading:
            current_start = start
        current_lines.append(line.rstrip())

    flush(len(text))

    clauses: list[SplitClause] = []
    ordinal = 0
    for num, heading, cstart, cend, body_lines in blocks:
        body = "\n".join(body_lines).strip()
        if not body and heading:
            # A heading with no body (e.g. a one-line "12. Penalty" section):
            # keep the words as clause text rather than dropping them.
            body, heading = heading, None
        if not body:
            continue
        if len(body) < MIN_CLAUSE_CHARS and not _looks_like_standalone_section(num, heading):
            # Merge tiny fragments into the previous clause rather than dropping text.
            if clauses:
                prev = clauses[-1]
                prev.text = f"{prev.text}\n{body}".strip()
                prev.char_end = cend
                continue
        if len(body) > MAX_CLAUSE_CHARS:
            for chunk in _split_long(body, cstart):
                ordinal += 1
                chunk.ordinal = ordinal
                chunk.page_number = _page_for(chunk.char_start, page_offsets)
                clauses.append(chunk)
            continue
        ordinal += 1
        clauses.append(
            SplitClause(
                ordinal=ordinal,
                section_id=num,
                heading=heading,
                text=body,
                char_start=cstart,
                char_end=cend,
                page_number=_page_for(cstart, page_offsets),
            )
        )

    return clauses


MAX_HEADING_CHARS = 90


def _split_heading(rest: str) -> tuple[str | None, str]:
    """Separate "Heading of section. Body starts here" into its two parts.

    The whole remainder must be preserved: when the heading and the first body
    sentence share a line, returning the line as the heading and an empty body
    would silently drop the body. So a heading is only recognised when it is
    short and is followed by further text.
    """
    sentence_end = rest.find(". ")
    if 0 < sentence_end <= MAX_HEADING_CHARS:
        heading = rest[:sentence_end].strip()
        body = rest[sentence_end + 2 :].strip()
        return heading, body
    if len(rest) <= MAX_HEADING_CHARS:
        # The entire line is the heading, with or without a trailing period.
        return rest.rstrip(".").strip() or rest.strip(), ""
    return None, rest


def _looks_like_standalone_section(num: str | None, heading: str | None) -> bool:
    return bool(num) and bool(heading)


def _split_long(body: str, start: int) -> list[SplitClause]:
    """Split an over-long clause on sub-clause boundaries."""
    parts: list[SplitClause] = []
    buffer: list[str] = []
    cursor = start
    part_start = start
    for line in body.split("\n"):
        if _SUBCLAUSE_RE.match(line.strip()) and buffer and sum(len(x) for x in buffer) > 1500:
            text = "\n".join(buffer).strip()
            parts.append(SplitClause(0, None, None, text, part_start, cursor))
            buffer = []
            part_start = cursor
        buffer.append(line)
        cursor += len(line) + 1
    text = "\n".join(buffer).strip()
    if text:
        parts.append(SplitClause(0, None, None, text, part_start, cursor))
    return parts


def _page_for(char_index: int, page_offsets: list[tuple[int, int, int]] | None) -> int | None:
    if not page_offsets:
        return None
    for page_number, start, end in page_offsets:
        if start <= char_index < end:
            return page_number
    return page_offsets[-1][0] if page_offsets else None
