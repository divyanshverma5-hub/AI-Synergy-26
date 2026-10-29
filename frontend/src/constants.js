/**
 * Shared vocabulary. These strings are the contract with the backend
 * (docs/SCHEMA.md) and are the only place the UI names a label, status or
 * category, so a rename never has to be hunted through components.
 */

// Classifier labels (stage 4). Keep separate from workflow statuses.
export const PREDICTED_LABELS = ['conflicts', 'removes_safeguard', 'consistent', 'unrelated']

export const LABEL_TEXT = {
  conflicts: 'Conflicts',
  removes_safeguard: 'Removes safeguard',
  consistent: 'Consistent',
  unrelated: 'Unrelated',
}

// Bill Health Summary categories (presentation only, never a legal conclusion).
export const HEALTH_CATEGORIES = ['clear', 'needs_review', 'safeguard_removed', 'direct_conflict']

export const HEALTH_TEXT = {
  clear: 'Clear',
  needs_review: 'Needs review',
  safeguard_removed: 'Safeguard removed',
  direct_conflict: 'Direct conflict',
}

// Human review workflow statuses (stage 6).
export const REVIEW_STATUSES = [
  'pending',
  'confirmed',
  'rejected',
  'relabelled',
  'insufficient_evidence',
]

export const REVIEW_STATUS_TEXT = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
  relabelled: 'Relabelled',
  insufficient_evidence: 'Insufficient evidence',
}

export const JOB_STATUSES = ['queued', 'processing', 'completed', 'failed']

export const RIGHTS_ARTICLES = ['article_14', 'article_19', 'article_21']

export const RIGHTS_TEXT = {
  article_14: 'Article 14 (equality)',
  article_19: 'Article 19 (freedoms)',
  article_21: 'Article 21 (life and personal liberty)',
}

export const RIGHTS_SHORT = {
  article_14: 'Art. 14',
  article_19: 'Art. 19',
  article_21: 'Art. 21',
}

export const DECISION_TEXT = {
  confirm: 'Confirm prediction',
  reject: 'Reject prediction',
  relabel: 'Change label',
  insufficient_evidence: 'Insufficient evidence',
}

export const DISCLAIMER =
  'Decision support only. This tool does not provide legal advice and never concludes that a provision is unconstitutional or legally invalid.'

export const DEMO_BANNER =
  'Demonstration data: these results come from seeded fictional material and heuristic analysis, not from a trained model.'
