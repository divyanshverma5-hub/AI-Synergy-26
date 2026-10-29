"""Real analysis provider: the integration point for the trained ML system.

This provider performs NO local inference. It forwards clauses to the
teammates' service and validates the response against the shared schema, so a
malformed or unreachable model service fails loudly instead of silently
producing empty results.

// TODO(ML-INTEGRATION): point REAL_ANALYSIS_ENDPOINT at the deployed classifier
// + retrieval service and confirm the response matches docs/SCHEMA.md.
// TODO(RETRIEVAL-INTEGRATION): retrieval may run inside the same service; if it
// stays separate, call it from here and merge the evidence rows.

Expected request body:

    {
      "schema_version": "1.0",
      "document_id": "...",
      "clauses": [
        {"id": "...", "ordinal": 1, "section_id": "3", "heading": "...", "text": "..."}
      ]
    }

Expected response body:

    {
      "schema_version": "1.0",
      "findings": [
        {
          "clause_id": "...",
          "predicted_label": "conflicts|removes_safeguard|consistent|unrelated",
          "confidence": 0.87,
          "explanation": "...",
          "rights_tags": ["article_21"],
          "requires_review": true,
          "evidence_sufficient": true,
          "implications": {"sufficient_evidence": true, "benefits": [], "drawbacks": [],
                            "affected_interests": [], "message": ""},
          "provision_id": "optional-internal-id",
          "evidence": [
            {"kind": "retrieved_provision", "snippet": "...", "source_title": "...",
             "source_section": "...", "source_reference": "...", "source_url": "...",
             "retrieval_score": 0.72}
          ]
        }
      ]
    }
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request

from sqlalchemy.orm import Session

from ..config import REAL_ANALYSIS_ENDPOINT, REAL_ANALYSIS_TIMEOUT
from ..models import Clause
from .base import (
    LABELS,
    AnalysisProvider,
    EvidenceDraft,
    FindingDraft,
    ProviderResult,
)

SCHEMA_VERSION = "1.0"


class RealProviderError(RuntimeError):
    """Raised when the ML service is misconfigured or returns invalid data."""


class RealAnalysisProvider(AnalysisProvider):
    name = "real"
    is_demonstration = False

    def __init__(self, endpoint: str | None = None) -> None:
        self.endpoint = (endpoint or REAL_ANALYSIS_ENDPOINT).strip()

    def analyze(self, clauses: list[Clause], session: Session) -> ProviderResult:
        if not self.endpoint:
            raise RealProviderError(
                "REAL_ANALYSIS_ENDPOINT is not configured. Set it to the ML service URL "
                "or run with ANALYSIS_PROVIDER=mock."
            )

        payload = {
            "schema_version": SCHEMA_VERSION,
            "document_id": clauses[0].document_id if clauses else None,
            "clauses": [
                {
                    "id": c.id,
                    "ordinal": c.ordinal,
                    "section_id": c.section_id,
                    "heading": c.heading,
                    "text": c.text,
                }
                for c in clauses
            ],
        }
        response = self._post(payload)
        findings = self._parse(response)
        return ProviderResult(
            findings=findings,
            provider=self.name,
            is_demonstration=False,
            notes="Findings produced by the external ML service.",
        )

    def _post(self, payload: dict) -> dict:
        request = urllib.request.Request(
            self.endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=REAL_ANALYSIS_TIMEOUT) as handle:
                body = handle.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:500]
            raise RealProviderError(f"ML service returned HTTP {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise RealProviderError(f"ML service unreachable at {self.endpoint}: {exc.reason}") from exc
        except TimeoutError as exc:
            raise RealProviderError(
                f"ML service timed out after {REAL_ANALYSIS_TIMEOUT}s."
            ) from exc
        try:
            return json.loads(body)
        except json.JSONDecodeError as exc:
            raise RealProviderError("ML service returned a non-JSON response.") from exc

    def _parse(self, response: dict) -> list[FindingDraft]:
        if not isinstance(response, dict) or "findings" not in response:
            raise RealProviderError("ML response is missing the 'findings' array.")
        raw_findings = response["findings"]
        if not isinstance(raw_findings, list):
            raise RealProviderError("'findings' must be an array.")

        drafts: list[FindingDraft] = []
        for index, item in enumerate(raw_findings):
            if not isinstance(item, dict):
                raise RealProviderError(f"findings[{index}] is not an object.")
            label = item.get("predicted_label")
            if label not in LABELS:
                raise RealProviderError(
                    f"findings[{index}].predicted_label={label!r} is not one of {LABELS}."
                )
            clause_id = item.get("clause_id")
            if not clause_id:
                raise RealProviderError(f"findings[{index}] is missing 'clause_id'.")
            evidence = [
                EvidenceDraft(
                    kind=str(e.get("kind", "retrieved_provision")),
                    snippet=str(e.get("snippet", "")),
                    source_title=str(e.get("source_title", "")),
                    source_section=e.get("source_section"),
                    source_reference=e.get("source_reference"),
                    source_url=e.get("source_url"),
                    retrieval_score=_as_float(e.get("retrieval_score")),
                    is_demonstration=False,
                )
                for e in item.get("evidence", [])
                if isinstance(e, dict)
            ]
            drafts.append(
                FindingDraft(
                    clause_id=str(clause_id),
                    predicted_label=label,
                    confidence=_as_float(item.get("confidence")),
                    explanation=str(item.get("explanation") or ""),
                    rights_tags=[t for t in item.get("rights_tags", []) if isinstance(t, str)],
                    requires_review=bool(item.get("requires_review", True)),
                    evidence_sufficient=bool(item.get("evidence_sufficient", True)),
                    implications=item.get("implications") or {},
                    provision_id=item.get("provision_id"),
                    evidence=evidence,
                )
            )
        return drafts


def _as_float(value: object) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if 0.0 <= number <= 1.0 else None
