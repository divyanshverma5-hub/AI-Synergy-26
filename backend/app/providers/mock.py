"""Demonstration analysis provider.

// MOCK DATA: every finding produced here is simulated. It is derived from the
// seeded demonstration provision corpus using keyword heuristics and term
// overlap, not from a trained model. All output is flagged
// `is_demonstration=True` and the UI labels it as such.

// TODO(ML-INTEGRATION): replace this provider with RealAnalysisProvider, which
// calls the teammates' trained relationship classifier.
// TODO(RETRIEVAL-INTEGRATION): stage 3 uses MockRetriever over seeded
// provisions; swap in the real legal retrieval pipeline.
"""

from __future__ import annotations

import re

from sqlalchemy.orm import Session

from ..models import Clause
from ..services.retrieval import MockRetriever, RetrievedProvision
from .base import AnalysisProvider, EvidenceDraft, FindingDraft, ProviderResult

# --- Heuristic signal vocabularies (demonstration only) ----------------------

# Phrases that commonly weaken or remove a protection in Indian legislative text.
_REMOVAL_SIGNALS = {
    "shall be omitted": 3.0,
    "is omitted": 3.0,
    "shall be deleted": 3.0,
    "shall cease to have effect": 3.0,
    "shall be repealed": 3.0,
    "no appeal shall lie": 3.5,
    "no appeal": 2.5,
    "shall not be entitled to appeal": 3.5,
    "shall not apply": 2.5,
    "shall not be applicable": 2.5,
    "shall be construed as": 1.0,
    "may be dispensed with": 3.0,
    "shall be dispensed with": 3.0,
    "notwithstanding anything contained": 1.5,
    "shall be reduced": 2.0,
    "without any remedy": 3.5,
    "shall be exempt": 1.5,
    "exempted from": 1.5,
    "minimum": 1.0,
    "shall stand omitted": 3.0,
}

# Phrases that commonly create a conflict with existing provisions.
_CONFLICT_SIGNALS = {
    "notwithstanding anything contained": 2.5,
    "shall have effect notwithstanding": 3.0,
    "shall prevail over": 3.0,
    "shall override": 3.0,
    "inconsistent with": 2.5,
    "shall be deemed to be inconsistent": 3.0,
    "shall be deemed to have been repealed": 3.0,
    "contrary to": 2.0,
    "shall supersede": 3.0,
}

# Rights-relevant vocabulary mapped to constitutional articles.
_RIGHTS_SIGNALS: dict[str, set[str]] = {
    "article_14": {
        "equality", "equal protection", "discriminat", "arbitrary", "class legislation",
        "reasonable classification", "unequal", "preferential treatment",
    },
    "article_19": {
        "freedom of speech", "expression", "assembly", "association", "movement",
        "residence", "profession", "occupation", "trade", "business", "press",
        "protest", "demonstration", "internet", "publication",
    },
    "article_21": {
        "life and personal liberty", "personal liberty", "due process", "privacy",
        "detain", "detention", "arrest", "habeas", "livelihood", "health", "education",
        "environment", "dignity", "bail", "remand", "custody", "personal data",
    },
}

# Safeguard-related vocabulary used for the safeguard alerts view.
_SAFEGUARD_TERMS = {
    "safeguard", "protection", "appeal", "review", "exemption", "exempt",
    "grievance", "redressal", "remedy", "hearing", "consent", "compensation",
    "immunity", "limitation", "period of limitation", "consultation",
}

_MIN_RETRIEVAL_SCORE = 0.9


class MockAnalysisProvider(AnalysisProvider):
    name = "mock"
    is_demonstration = True

    def analyze(self, clauses: list[Clause], session: Session) -> ProviderResult:
        # Stage 3: retrieval (// TODO(RETRIEVAL-INTEGRATION): real corpus).
        retriever = MockRetriever(session)
        findings: list[FindingDraft] = []
        for clause in clauses:
            retrieved = retriever.retrieve(clause.text, k=1)
            findings.append(self._analyse_clause(clause, retrieved))
        return ProviderResult(
            findings=findings,
            provider=self.name,
            is_demonstration=True,
            notes=(
                "Demonstration analysis: labels come from keyword heuristics over the "
                "seeded provision corpus, not from a trained classifier."
            ),
        )

    # -- Stage 4: classification -------------------------------------------
    def _analyse_clause(
        self, clause: Clause, retrieved: list[RetrievedProvision]
    ) -> FindingDraft:
        text_lower = clause.text.lower()
        top = retrieved[0] if retrieved else None
        retrieval_score = top.score if top else 0.0
        rights_tags = _tag_rights(text_lower)

        if top is None or retrieval_score < _MIN_RETRIEVAL_SCORE:
            # No relevant provision found: say so instead of inventing a conflict.
            return FindingDraft(
                clause_id=clause.id,
                predicted_label="unrelated",
                confidence=None,
                explanation=(
                    "No existing provision in the comparison corpus matched this clause "
                    "closely enough to support a relationship claim. Marked for review "
                    "because retrieval coverage is limited in this demonstration build."
                ),
                rights_tags=rights_tags,
                requires_review=True,
                evidence_sufficient=False,
                implications=_implications("unrelated", sufficient=False),
                provision_id=None,
                evidence=[],
            )

        conflict_score = _signal_score(text_lower, _CONFLICT_SIGNALS)
        removal_score = _signal_score(text_lower, _REMOVAL_SIGNALS)
        label = _decide_label(conflict_score, removal_score, retrieval_score)

        evidence = _build_evidence(clause, top)
        sufficient = label in {"conflicts", "removes_safeguard", "consistent"}
        requires_review = (
            label in {"conflicts", "removes_safeguard"}
            or bool(rights_tags)
            or not sufficient
            or retrieval_score < 2.0
        )

        return FindingDraft(
            clause_id=clause.id,
            predicted_label=label,
            confidence=_pseudo_confidence(label, conflict_score, removal_score, retrieval_score),
            explanation=_explain(label, top, conflict_score, removal_score, retrieval_score),
            rights_tags=rights_tags,
            requires_review=requires_review,
            evidence_sufficient=sufficient,
            implications=_implications(label, sufficient=sufficient),
            provision_id=top.provision.id,
            evidence=evidence,
        )


def _signal_score(text_lower: str, signals: dict[str, float]) -> float:
    return sum(weight for phrase, weight in signals.items() if phrase in text_lower)


def _decide_label(conflict: float, removal: float, retrieval: float) -> str:
    if conflict >= 2.5 and conflict >= removal:
        return "conflicts"
    if removal >= 2.0:
        return "removes_safeguard"
    if retrieval >= _MIN_RETRIEVAL_SCORE:
        return "consistent"
    return "unrelated"


def _pseudo_confidence(label: str, conflict: float, removal: float, retrieval: float) -> float:
    """A bounded demonstration score, not a calibrated model probability.

    Derived from measurable signal counts so it is deterministic and traceable.
    // MOCK DATA: replace with the classifier's calibrated probability.
    """
    if label == "conflicts":
        base = 0.55 + min(conflict, 6.0) / 20.0
    elif label == "removes_safeguard":
        base = 0.55 + min(removal, 6.0) / 20.0
    elif label == "consistent":
        base = 0.5 + min(retrieval, 4.0) / 25.0
    else:
        base = 0.35
    return round(min(base, 0.95), 2)


def _explain(
    label: str, top: RetrievedProvision, conflict: float, removal: float, retrieval: float
) -> str:
    section = f"{top.provision.act_title}, {top.provision.section_id}"
    if label == "conflicts":
        return (
            f"The clause contains language that may conflict with {section}. "
            f"Demonstration signals: conflict={conflict:.1f}, overlap={retrieval:.2f}. "
            "This is a demonstration explanation and requires human review."
        )
    if label == "removes_safeguard":
        return (
            f"The clause appears to weaken or remove a protection found in {section}. "
            f"Demonstration signals: removal={removal:.1f}, overlap={retrieval:.2f}. "
            "This is a demonstration explanation and requires human review."
        )
    if label == "consistent":
        return (
            f"The clause appears broadly consistent with {section} "
            f"(overlap={retrieval:.2f}). No conflicting language was detected by the "
            "demonstration heuristics."
        )
    return "No relevant provision was retrieved for this clause."


def _tag_rights(text_lower: str) -> list[str]:
    """Stage 5 rights tagging. Tags flag relevance for review, not conclusions."""
    tags: list[str] = []
    for article, terms in _RIGHTS_SIGNALS.items():
        if any(term in text_lower for term in terms):
            tags.append(article)
    return tags


def _build_evidence(clause: Clause, top: RetrievedProvision) -> list[EvidenceDraft]:
    provision = top.provision
    # TODO(LEGAL-DATA): replace with verified source documents and canonical URLs.
    evidence = [
        EvidenceDraft(
            kind="retrieved_provision",
            snippet=_snippet(provision.text, top.matched_terms),
            source_title=provision.act_title,
            source_section=provision.section_id,
            source_reference=provision.source_reference,
            source_url=provision.source_url,
            retrieval_score=top.score,
            is_demonstration=provision.is_demonstration,
        ),
        EvidenceDraft(
            kind="clause_span",
            snippet=clause.text[:600],
            source_title="Uploaded bill",
            source_section=clause.section_id,
            source_reference=f"clause ordinal {clause.ordinal}",
            source_url=None,
            retrieval_score=None,
            is_demonstration=False,
        ),
    ]
    return evidence


def _snippet(text: str, terms: list[str], width: int = 360) -> str:
    """Centre a snippet on the first matched term so evidence stays readable."""
    if not text:
        return ""
    lowered = text.lower()
    index = 0
    for term in terms:
        found = lowered.find(term.lower())
        if found != -1:
            index = found
            break
    start = max(0, index - width // 3)
    end = min(len(text), start + width)
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(text) else ""
    return f"{prefix}{text[start:end].strip()}{suffix}"


def _implications(label: str, sufficient: bool) -> dict[str, object]:
    """Stage 5 implications. Only populated when evidence is sufficient."""
    if not sufficient:
        return {
            "sufficient_evidence": False,
            "message": "Insufficient evidence to determine the implications of this clause.",
            "benefits": [],
            "drawbacks": [],
            "affected_interests": [],
        }
    # MOCK DATA: demonstration implications, replaced by the real pipeline.
    catalogue = {
        "conflicts": {
            "benefits": ["May simplify or streamline the procedure the clause governs."],
            "drawbacks": ["Could create uncertainty where the earlier provision still applies."],
            "affected_interests": ["Persons relying on the earlier provision", "Implementing authority"],
        },
        "removes_safeguard": {
            "benefits": ["May speed up decision-making by reducing procedural steps."],
            "drawbacks": ["Reduces the protections available to affected persons."],
            "affected_interests": ["Persons affected by the decision", "Review or appellate bodies"],
        },
        "consistent": {
            "benefits": ["Aligns with the existing scheme, limiting interpretive risk."],
            "drawbacks": [],
            "affected_interests": ["Implementing authority"],
        },
        "unrelated": {"benefits": [], "drawbacks": [], "affected_interests": []},
    }
    entry = catalogue.get(label, catalogue["unrelated"])
    return {
        "sufficient_evidence": True,
        "message": "Demonstration implications based on the predicted relationship.",
        "benefits": entry["benefits"],
        "drawbacks": entry["drawbacks"],
        "affected_interests": entry["affected_interests"],
    }
