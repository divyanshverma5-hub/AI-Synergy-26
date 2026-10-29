"""Stage 3 of the analysis pipeline: retrieval of relevant existing provisions.

`MockRetriever` scores the seeded demonstration corpus with TF-IDF-ish term
overlap. It is intentionally simple and is replaced by the teammates' legal
retrieval pipeline behind the same `Retriever` protocol.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Provision

_WORD_RE = re.compile(r"[a-z][a-z0-9]{2,}")
_STOPWORDS = {
    "the", "and", "for", "that", "with", "shall", "under", "this", "such", "any",
    "from", "have", "been", "which", "may", "not", "are", "was", "were", "its",
    "into", "upon", "also", "than", "then", "they", "them", "their", "there",
    "hereby", "provided", "whereas", "section", "act", "bill", "clause",
}


@dataclass
class RetrievedProvision:
    provision: Provision
    score: float
    matched_terms: list[str]


class Retriever(Protocol):
    def retrieve(self, clause_text: str, k: int = 3) -> list[RetrievedProvision]: ...


def _terms(text: str) -> list[str]:
    return [w for w in _WORD_RE.findall(text.lower()) if w not in _STOPWORDS]


class MockRetriever:
    """// TODO(RETRIEVAL-INTEGRATION): replace with the legal retrieval pipeline.

    This class exists so stage 3 of the pipeline has a working implementation
    today. The real pipeline should implement the same `retrieve()` signature
    and return `RetrievedProvision` objects with real `source_reference` and
    `source_url` values. No real source links are fabricated here.
    """

    def __init__(self, session: Session) -> None:
        self._session = session
        self._provisions = list(session.scalars(select(Provision)))
        self._doc_freq: Counter[str] = Counter()
        for provision in self._provisions:
            for term in set(_terms(provision.text + " " + (provision.heading or ""))):
                self._doc_freq[term] += 1
        self._total = max(len(self._provisions), 1)

    def _idf(self, term: str) -> float:
        return math.log((self._total + 1) / (self._doc_freq.get(term, 0) + 1)) + 1.0

    def retrieve(self, clause_text: str, k: int = 3) -> list[RetrievedProvision]:
        if not self._provisions:
            return []
        query_terms = _terms(clause_text)
        if not query_terms:
            return []
        query_counts = Counter(query_terms)
        scored: list[RetrievedProvision] = []
        for provision in self._provisions:
            provision_terms = Counter(
                _terms(provision.text + " " + (provision.heading or "") + " " + provision.section_id)
            )
            if not provision_terms:
                continue
            score = 0.0
            matched: list[str] = []
            for term, qcount in query_counts.items():
                if term in provision_terms:
                    score += qcount * self._idf(term) * (1.0 + math.log(provision_terms[term]))
                    matched.append(term)
            if score > 0:
                # Normalise so scores stay comparable across clauses of any length.
                norm = math.sqrt(sum(v * v for v in query_counts.values())) or 1.0
                scored.append(
                    RetrievedProvision(
                        provision=provision,
                        score=round(score / norm, 4),
                        matched_terms=sorted(set(matched))[:12],
                    )
                )
        scored.sort(key=lambda r: r.score, reverse=True)
        return scored[:k]
