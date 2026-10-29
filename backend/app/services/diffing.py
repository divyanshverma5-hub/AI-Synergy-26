"""Word-level text diff used by the Clause Explorer to highlight changes.

Returns plain data (no HTML) so the frontend owns all rendering. Two views are
produced:

* `segments` - a linear op list (equal / added / removed) for a unified view.
* `old` / `new` - the same comparison split per side, for the side-by-side view
  where removals are marked on the earlier provision and additions on the new
  clause.
"""

from __future__ import annotations

import difflib
import re
from typing import Literal

Op = Literal["equal", "added", "removed"]

_TOKEN_RE = re.compile(r"\s+|[^\s]+")


def _tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text or "")


def diff_segments(old_text: str, new_text: str) -> list[dict[str, str]]:
    """Unified diff as a flat list of {type, text} segments."""
    old_tokens = _tokenize(old_text)
    new_tokens = _tokenize(new_text)
    matcher = difflib.SequenceMatcher(a=old_tokens, b=new_tokens, autojunk=False)
    segments: list[dict[str, str]] = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            _append(segments, "equal", "".join(old_tokens[i1:i2]))
        elif tag == "delete":
            _append(segments, "removed", "".join(old_tokens[i1:i2]))
        elif tag == "insert":
            _append(segments, "added", "".join(new_tokens[j1:j2]))
        else:  # replace
            _append(segments, "removed", "".join(old_tokens[i1:i2]))
            _append(segments, "added", "".join(new_tokens[j1:j2]))
    return [s for s in segments if s["text"]]


def highlight_pair(old_text: str, new_text: str) -> dict[str, list[dict[str, str]]]:
    """Side-by-side segments: removals on the old side, additions on the new."""
    old_tokens = _tokenize(old_text)
    new_tokens = _tokenize(new_text)
    matcher = difflib.SequenceMatcher(a=old_tokens, b=new_tokens, autojunk=False)
    old_segments: list[dict[str, str]] = []
    new_segments: list[dict[str, str]] = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            _append(old_segments, "equal", "".join(old_tokens[i1:i2]))
            _append(new_segments, "equal", "".join(new_tokens[j1:j2]))
        elif tag == "delete":
            _append(old_segments, "removed", "".join(old_tokens[i1:i2]))
        elif tag == "insert":
            _append(new_segments, "added", "".join(new_tokens[j1:j2]))
        else:
            _append(old_segments, "removed", "".join(old_tokens[i1:i2]))
            _append(new_segments, "added", "".join(new_tokens[j1:j2]))
    return {
        "old": [s for s in old_segments if s["text"]],
        "new": [s for s in new_segments if s["text"]],
    }


def similarity(old_text: str, new_text: str) -> float:
    """Token-level similarity ratio in [0, 1]."""
    old_tokens = _tokenize(old_text)
    new_tokens = _tokenize(new_text)
    if not old_tokens and not new_tokens:
        return 1.0
    return difflib.SequenceMatcher(a=old_tokens, b=new_tokens, autojunk=False).ratio()


def _append(segments: list[dict[str, str]], kind: Op, text: str) -> None:
    if not text:
        return
    if segments and segments[-1]["type"] == kind:
        segments[-1]["text"] += text
    else:
        segments.append({"type": kind, "text": text})
