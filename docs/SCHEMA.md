# Shared data schema

This is the contract between the pipeline stages, the database, the REST API and
the frontend. Field names and label strings are used identically everywhere; the
frontend keeps them in `frontend/src/constants.js` and the backend in
`backend/app/schemas.py` and `backend/app/models.py`.

Schema version: **1.0** (sent as `schema_version` in ML provider payloads).

## Pipeline stages

Each stage is independent so the ML work can replace stages 3-5 without
disturbing the rest.

| # | Stage | Implemented in | Replaceable by |
| --- | --- | --- | --- |
| 1 | PDF text extraction | `services/pdf_extract.py` | — (stays local) |
| 2 | Clause splitting | `services/clauses.py` | — (stays local) |
| 3 | Retrieval of provisions | `services/retrieval.py` | ML service / vector store |
| 4 | Four-class classification | `providers/*` | Trained classifier |
| 5 | Explanation + rights tagging | `providers/*` | Trained model |
| 6 | Human review + audit | `services/review.py`, `services/audit.py` | — (stays local) |

Stages 1-2 run before the provider is called; stage 6 runs after. A provider
receives `Clause` rows and a session, and returns `FindingDraft` objects.

## Vocabulary

These strings are fixed. Do not rename them in one layer only.

### Classifier labels (stage 4 output)

| Value | Meaning |
| --- | --- |
| `conflicts` | The new clause conflicts with an existing provision. |
| `removes_safeguard` | The new clause removes or weakens an existing protection. |
| `consistent` | The clause is consistent with the matched provision. |
| `unrelated` | No relevant existing provision was found. |

### Review statuses (stage 6 workflow state)

`pending`, `confirmed`, `rejected`, `relabelled`, `insufficient_evidence`.

Labels and review statuses are deliberately separate: a finding can be
`conflicts` and `rejected` at the same time. The UI never mixes the two.

### Health categories (presentation only)

`clear`, `needs_review`, `safeguard_removed`, `direct_conflict`.

Derived from the label and review status for the Bill Health Summary. Not a
legal conclusion.

### Rights tags (review triggers)

`article_14`, `article_19`, `article_21`.

A tag means the clause's language may engage that article. It is not a finding
of unconstitutionality, and tagged clauses always require human review.

### Job statuses

`queued`, `processing`, `completed`, `failed`.

### Reviewer decisions

`confirm`, `reject`, `relabel`, `insufficient_evidence`.

## Finding payload (shared JSON)

This is what `MockAnalysisProvider` returns and what `RealAnalysisProvider`
expects back from the ML service.

```json
{
  "schema_version": "1.0",
  "document_id": "…",
  "clauses": [
    { "id": "…", "ordinal": 4, "section_id": "3", "heading": "…", "text": "…" }
  ]
}
```

Response:

```json
{
  "schema_version": "1.0",
  "findings": [
    {
      "clause_id": "…",
      "predicted_label": "removes_safeguard",
      "confidence": 0.85,
      "explanation": "…",
      "rights_tags": ["article_21"],
      "requires_review": true,
      "evidence_sufficient": true,
      "implications": {
        "sufficient_evidence": true,
        "message": "…",
        "benefits": ["…"],
        "drawbacks": ["…"],
        "affected_interests": ["…"]
      },
      "provision_id": "optional-internal-id",
      "evidence": [
        {
          "kind": "retrieved_provision",
          "snippet": "…",
          "source_title": "…",
          "source_section": "Section 9",
          "source_reference": "…",
          "source_url": "https://…",
          "retrieval_score": 0.77
        }
      ]
    }
  ]
}
```

### Field rules

| Field | Type | Rules |
| --- | --- | --- |
| `clause_id` | string | Required. Must match an id sent in the request. |
| `predicted_label` | enum | Required. One of the four labels. Anything else is rejected. |
| `confidence` | float \| null | Optional. Clamped to 0.0-1.0; out-of-range values become `null`. |
| `explanation` | string | Optional. Stored and shown verbatim. |
| `rights_tags` | string[] | Optional. Non-string entries are dropped. |
| `requires_review` | bool | Defaults to `true`. |
| `evidence_sufficient` | bool | Defaults to `true`. `false` makes the UI state that implications cannot be determined. |
| `implications` | object | Optional. When `sufficient_evidence` is `false`, the UI shows the message instead of any lists. |
| `provision_id` | string \| null | Optional internal reference to a corpus provision. |
| `evidence` | object[] | Optional. Each row needs at least `snippet` and `source_title`. |

If evidence is missing or contradictory, set `evidence_sufficient: false` and
`requires_review: true`. Do not invent a conclusion.

## Reviewer decision payload

Request to `POST /api/reviews`:

```json
{
  "finding_id": "…",
  "decision": "relabel",
  "updated_label": "conflicts",
  "reason": "Overrides the earlier provision expressly.",
  "notes": "",
  "reviewer": "reviewer-a",
  "is_usable_for_training": true
}
```

Effect on the finding:

| Decision | `effective_label` | `review_status` | `health_category` | `requires_review` |
| --- | --- | --- | --- | --- |
| `confirm` | keeps the prediction | `confirmed` | from the label | `false` |
| `reject` | keeps the prediction | `rejected` | `clear` | `false` |
| `relabel` | `updated_label` | `relabelled` | from the new label | `false` |
| `insufficient_evidence` | `null` | `insufficient_evidence` | `needs_review` | `true` |

## Demonstration flagging

Two booleans keep fictional material distinguishable from real material:

- `is_demonstration` on `Document`, `Provision`, `Analysis`, `Evidence` and
  `ModelMetric`.
- Seeded rows have `is_demonstration = true`; uploaded documents and anything
  the real provider returns have `is_demonstration = false`.

The UI shows a "demonstration data" badge wherever the flag is set.
