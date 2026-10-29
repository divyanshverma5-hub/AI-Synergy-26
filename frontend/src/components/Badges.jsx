import { HEALTH_TEXT, LABEL_TEXT, REVIEW_STATUS_TEXT } from '../constants'

const LABEL_TONE = {
  conflicts: 'danger',
  removes_safeguard: 'warn',
  consistent: 'ok',
  unrelated: 'neutral',
}

const HEALTH_TONE = {
  clear: 'ok',
  needs_review: 'info',
  safeguard_removed: 'warn',
  direct_conflict: 'danger',
}

const STATUS_TONE = {
  pending: 'info',
  confirmed: 'ok',
  rejected: 'danger',
  relabelled: 'accent',
  insufficient_evidence: 'warn',
}

const JOB_TONE = {
  queued: 'neutral',
  processing: 'info',
  completed: 'ok',
  failed: 'danger',
}

export function Badge({ tone = 'neutral', children, title }) {
  return (
    <span className={`badge ${tone}`} title={title}>
      {children}
    </span>
  )
}

/** Classifier label. Never a legal conclusion. */
export function LabelBadge({ label }) {
  return (
    <Badge tone={LABEL_TONE[label] || 'neutral'} title={`Classifier label: ${label}`}>
      {LABEL_TEXT[label] || label}
    </Badge>
  )
}

/** Bill Health Summary category (presentation concept). */
export function HealthBadge({ category }) {
  return (
    <Badge tone={HEALTH_TONE[category] || 'neutral'} title={`Bill health category: ${category}`}>
      {HEALTH_TEXT[category] || category}
    </Badge>
  )
}

/** Human review workflow status. */
export function ReviewStatusBadge({ status }) {
  return (
    <Badge tone={STATUS_TONE[status] || 'neutral'} title={`Review status: ${status}`}>
      {REVIEW_STATUS_TEXT[status] || status}
    </Badge>
  )
}

export function JobStatusBadge({ status }) {
  return (
    <Badge tone={JOB_TONE[status] || 'neutral'} title={`Job status: ${status}`}>
      {status}
    </Badge>
  )
}

export function ConfidenceBadge({ value }) {
  if (value === null || value === undefined) {
    return <Badge tone="neutral" title="The provider did not return a confidence score">no score</Badge>
  }
  return (
    <Badge tone="neutral" title="Demonstration score, not a calibrated model probability">
      {(value * 100).toFixed(0)}% confidence
    </Badge>
  )
}

export function DemoBadge({ label = 'demonstration data' }) {
  return (
    <Badge tone="accent" title="Fictional, simulated data — not real legal material">
      {label}
    </Badge>
  )
}
