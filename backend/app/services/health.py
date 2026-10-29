"""Health summary mapping.

Prediction labels and workflow statuses are different things and must not be
collapsed into one field:

    predicted_label   what the classifier says (conflicts / removes_safeguard /
                      consistent / unrelated)
    review_status     where the finding is in human review (pending / confirmed /
                      rejected / relabelled / insufficient_evidence)
    health_category   what the Bill Health Summary shows (clear / needs_review /
                      safeguard_removed / direct_conflict)

`health_category` is derived from the label a reviewer has settled on, falling
back to the prediction, and is escalated to `needs_review` whenever a finding is
unsettled or evidence is insufficient. It is a presentation concept, never a
legal conclusion.
"""

from __future__ import annotations

from ..models import Finding

_LABEL_TO_HEALTH = {
    "conflicts": "direct_conflict",
    "removes_safeguard": "safeguard_removed",
    "consistent": "clear",
    "unrelated": "needs_review",
}


def current_label(finding: Finding) -> str:
    """The label a human has settled on, otherwise the model prediction."""
    return finding.effective_label or finding.predicted_label


def health_category_for(finding: Finding) -> str:
    label = current_label(finding)
    category = _LABEL_TO_HEALTH.get(label, "needs_review")
    if finding.review_status == "insufficient_evidence" or not finding.evidence_sufficient:
        return "needs_review"
    if finding.review_status == "rejected":
        # A rejected prediction is not a confirmed conflict; keep it visible for review.
        return "needs_review" if category != "clear" else "clear"
    if finding.review_status == "pending" and label in {"conflicts", "removes_safeguard"}:
        return category
    if finding.requires_review and finding.review_status == "pending" and category == "clear":
        return "needs_review"
    return category
