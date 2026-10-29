import { useCallback, useState } from 'react'
import { api } from '../api'
import { DECISION_TEXT, LABEL_TEXT, PREDICTED_LABELS } from '../constants'
import { ErrorState } from './Feedback'

// A relabel, rejection or insufficient-evidence call must carry a reason so the
// audit trail records why the model output was overridden. Mirrors the backend
// validation in schemas.ReviewCreate.
const REASON_REQUIRED = new Set(['relabel', 'reject', 'insufficient_evidence'])

/**
 * Compact decision form. Used on the analysis results page and the review
 * centre so a reviewer can act on a finding without leaving the page.
 * Submitting does not retrain any model; it stores a decision and an audit row.
 */
export function ReviewForm({ finding, onSaved, compact = false }) {
  const [form, setForm] = useState({
    decision: 'confirm',
    updated_label: '',
    reason: '',
    notes: '',
    reviewer: 'reviewer',
    is_usable_for_training: true,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [flash, setFlash] = useState(null)

  const reasonMissing = REASON_REQUIRED.has(form.decision) && !form.reason.trim()
  const labelMissing = form.decision === 'relabel' && !form.updated_label

  const submit = useCallback(
    async (event) => {
      event.preventDefault()
      setError(null)
      setFlash(null)
      if (reasonMissing) {
        setError(`A reason is required when the decision is “${DECISION_TEXT[form.decision]}”.`)
        return
      }
      if (labelMissing) {
        setError('Choose the corrected label before saving a relabelled decision.')
        return
      }
      setSubmitting(true)
      try {
        await api.createReview({
          finding_id: finding.id,
          decision: form.decision,
          updated_label: form.decision === 'relabel' ? form.updated_label : undefined,
          reason: form.reason.trim(),
          notes: form.notes.trim(),
          reviewer: form.reviewer.trim() || 'reviewer',
          is_usable_for_training: form.is_usable_for_training,
        })
        setFlash(`Saved a “${DECISION_TEXT[form.decision]}” decision.`)
        setForm((current) => ({ ...current, reason: '', notes: '', updated_label: '' }))
        if (onSaved) await onSaved()
      } catch (cause) {
        setError(cause.message)
      } finally {
        setSubmitting(false)
      }
    },
    [finding, form, reasonMissing, labelMissing, onSaved],
  )

  return (
    <form className="review-form" onSubmit={submit}>
      {error ? <ErrorState error={error} /> : null}
      {flash ? <p className="small" style={{ color: 'var(--ok)' }}>{flash}</p> : null}

      <div className={compact ? 'review-form-row' : ''}>
        <label className="field">
          <span>Reviewer name</span>
          <input
            type="text"
            value={form.reviewer}
            maxLength={120}
            onChange={(event) => setForm({ ...form, reviewer: event.target.value })}
          />
        </label>

        <label className="field">
          <span>Decision</span>
          <select
            value={form.decision}
            onChange={(event) => setForm({ ...form, decision: event.target.value })}
          >
            {Object.entries(DECISION_TEXT).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </label>
      </div>

      {form.decision === 'relabel' ? (
        <label className="field">
          <span>Corrected label</span>
          <select
            value={form.updated_label}
            onChange={(event) => setForm({ ...form, updated_label: event.target.value })}
          >
            <option value="">Choose a label…</option>
            {PREDICTED_LABELS.map((option) => (
              <option key={option} value={option}>
                {LABEL_TEXT[option]}
              </option>
            ))}
          </select>
          <span className="field-hint">
            Must differ from the current label ({LABEL_TEXT[finding.predicted_label]}).
          </span>
        </label>
      ) : null}

      <label className="field">
        <span>Reason {REASON_REQUIRED.has(form.decision) ? '(required)' : '(optional)'}</span>
        <textarea
          value={form.reason}
          maxLength={2000}
          onChange={(event) => setForm({ ...form, reason: event.target.value })}
          placeholder="Why this decision? This is stored in the audit log."
        />
      </label>

      <label className="field">
        <span>Notes (optional)</span>
        <textarea
          value={form.notes}
          maxLength={2000}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
          placeholder="Anything else the next reviewer should know."
        />
      </label>

      <label className="field">
        <span>
          <input
            type="checkbox"
            style={{ width: 'auto', marginRight: 6 }}
            checked={form.is_usable_for_training}
            onChange={(event) =>
              setForm({ ...form, is_usable_for_training: event.target.checked })
            }
          />
          Mark this correction as usable for future training
        </span>
        <span className="field-hint">Saved for a future dataset. No model is retrained by this action.</span>
      </label>

      <div className="btn-row">
        <button
          type="submit"
          className="btn primary"
          disabled={submitting || reasonMissing || labelMissing}
        >
          {submitting ? 'Saving…' : 'Save decision'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={submitting}
          onClick={() =>
            setForm((current) => ({
              ...current,
              reason: '',
              notes: '',
              updated_label: '',
              decision: 'confirm',
            }))
          }
        >
          Reset form
        </button>
      </div>
      {reasonMissing ? (
        <p className="faint small mt-1">A reason is required for this decision type.</p>
      ) : null}
    </form>
  )
}
