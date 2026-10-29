import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import {
  HEALTH_CATEGORIES,
  HEALTH_TEXT,
  LABEL_TEXT,
  PREDICTED_LABELS,
  RIGHTS_SHORT,
} from '../constants'
import { DemoBadge, HealthBadge, LabelBadge, ReviewStatusBadge } from '../components/Badges'
import { Alert, EmptyState, ErrorState, Loading } from '../components/Feedback'
import { PageHeader } from '../components/Layout'
import { useAsync } from '../components/hooks'

const HEALTH_TONE = {
  clear: 'ok',
  needs_review: 'info',
  safeguard_removed: 'warn',
  direct_conflict: 'danger',
}

export default function BillHealth() {
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState(null)

  const analyses = useAsync(() => api.listAnalyses({ limit: 100 }), [])
  const completed = useMemo(
    () => (analyses.data || []).filter((a) => a.status === 'completed'),
    [analyses.data],
  )

  const analysisId = params.get('analysis') || completed[0]?.id || null
  const healthFilter = params.get('health') || ''
  const labelFilter = params.get('label') || ''

  const results = useAsync(
    () => (analysisId ? api.getResults(analysisId) : Promise.resolve(null)),
    [analysisId],
    { immediate: Boolean(analysisId) },
  )

  useEffect(() => {
    if (!params.get('analysis') && analysisId) {
      const next = new URLSearchParams(params)
      next.set('analysis', analysisId)
      setParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisId])

  const findings = results.data?.findings || []
  const visible = findings.filter((finding) => {
    if (healthFilter && finding.health_category !== healthFilter) return false
    if (labelFilter && (finding.effective_label || finding.predicted_label) !== labelFilter) {
      return false
    }
    return true
  })

  const setFilter = useCallback(
    (key, value) => {
      const next = new URLSearchParams(params)
      if (value) next.set(key, value)
      else next.delete(key)
      setParams(next)
    },
    [params, setParams],
  )

  const counts = results.data?.counts

  return (
    <>
      <PageHeader title="Bill health summary">
        <p>
          A clause map for the selected analysis. Categories group clauses by how they relate to
          existing provisions. Labels are the classifier's four-class output; review statuses
          track the human workflow. Neither is a legal conclusion.
        </p>
      </PageHeader>

      <div className="card">
        <div className="filters">
          <label className="field">
            <span>Analysis</span>
            <select
              value={analysisId || ''}
              onChange={(event) => {
                const next = new URLSearchParams(params)
                if (event.target.value) next.set('analysis', event.target.value)
                else next.delete('analysis')
                setParams(next)
              }}
            >
              <option value="">Select an analysis…</option>
              {completed.map((analysis) => (
                <option key={analysis.id} value={analysis.id}>
                  {analysis.id.slice(0, 8)} · {analysis.finding_count} findings ·{' '}
                  {new Date(analysis.created_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Health category</span>
            <select value={healthFilter} onChange={(e) => setFilter('health', e.target.value)}>
              <option value="">All categories</option>
              {HEALTH_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {HEALTH_TEXT[category]}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Predicted label</span>
            <select value={labelFilter} onChange={(e) => setFilter('label', e.target.value)}>
              <option value="">All labels</option>
              {PREDICTED_LABELS.map((label) => (
                <option key={label} value={label}>
                  {LABEL_TEXT[label]}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="btn small"
            onClick={() => {
              setParams(analysisId ? { analysis: analysisId } : {})
            }}
          >
            Clear filters
          </button>
        </div>
      </div>

      {!analysisId ? (
        <EmptyState>
          No completed analysis is available. <Link to="/upload">Upload a bill</Link> and run an
          analysis first.
        </EmptyState>
      ) : null}

      {results.loading && !results.data ? <Loading label="Loading findings…" /> : null}
      {results.error ? <ErrorState error={results.error} onRetry={results.refetch} /> : null}

      {results.data ? (
        <>
          {results.data.analysis.is_demonstration ? (
            <Alert tone="info" title="Demonstration analysis">
              Findings for this job come from the mock provider and seeded fictional provisions.
            </Alert>
          ) : null}

          <div className="card">
            <div className="card-header">
              <h2>Clause map</h2>
              <span className="faint small">
                {visible.length} of {findings.length} clauses shown
              </span>
            </div>
            <div className="badge-row mb-2">
              {HEALTH_CATEGORIES.map((category) => {
                const active = healthFilter === category
                return (
                  <button
                    key={category}
                    type="button"
                    className={`badge ${HEALTH_TONE[category]}`}
                    style={{
                      cursor: 'pointer',
                      outline: active ? '2px solid var(--accent)' : 'none',
                      fontFamily: 'inherit',
                    }}
                    onClick={() => setFilter('health', active ? '' : category)}
                    title={`Filter by ${HEALTH_TEXT[category]}`}
                  >
                    {HEALTH_TEXT[category]}: {counts?.[category] ?? 0}
                  </button>
                )
              })}
            </div>

            {visible.length === 0 ? (
              <EmptyState>No clauses match the current filters.</EmptyState>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Clause</th>
                      <th>Health</th>
                      <th>Label</th>
                      <th>Review</th>
                      <th>Rights</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((finding) => (
                      <tr key={finding.id}>
                        <td>
                          <div className="finding-title">
                            {finding.clause?.section_id
                              ? `Section ${finding.clause.section_id}`
                              : `Clause ${finding.clause?.ordinal ?? '?'}`}
                            {finding.clause?.heading ? ` — ${finding.clause.heading}` : ''}
                          </div>
                          <div className="finding-snippet">
                            {(finding.clause?.text || '').slice(0, 150)}
                          </div>
                        </td>
                        <td>
                          <HealthBadge category={finding.health_category} />
                        </td>
                        <td>
                          <LabelBadge label={finding.effective_label || finding.predicted_label} />
                          {finding.effective_label &&
                          finding.effective_label !== finding.predicted_label ? (
                            <div className="faint small">
                              model said {LABEL_TEXT[finding.predicted_label]}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <ReviewStatusBadge status={finding.review_status} />
                        </td>
                        <td className="small">
                          {(finding.rights_tags || []).map((tag) => RIGHTS_SHORT[tag]).join(', ') ||
                            '—'}
                        </td>
                        <td className="nowrap">
                          <button
                            type="button"
                            className="btn small"
                            onClick={() => setSelected(finding)}
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {selected ? (
            <div className="card">
              <div className="card-header">
                <h3>Selected clause</h3>
                <button type="button" className="btn small" onClick={() => setSelected(null)}>
                  Close
                </button>
              </div>
              <div className="badge-row mb-2">
                <HealthBadge category={selected.health_category} />
                <LabelBadge label={selected.effective_label || selected.predicted_label} />
                <ReviewStatusBadge status={selected.review_status} />
                {selected.evidence_sufficient ? null : (
                  <span className="badge warn">insufficient evidence</span>
                )}
              </div>
              <div className="clause-text">{selected.clause?.text || 'Clause text unavailable.'}</div>
              <p className="mt-2 small">{selected.explanation}</p>
              <div className="btn-row">
                <Link className="btn" to={`/explorer?finding=${selected.id}`}>
                  Open in clause explorer
                </Link>
                <Link className="btn primary" to={`/review?finding=${selected.id}`}>
                  Review this finding
                </Link>
              </div>
            </div>
          ) : null}

          <div className="card">
            <div className="card-header">
              <h2>Analysis summary</h2>
              {results.data.document.is_demonstration ? <DemoBadge /> : null}
            </div>
            <p className="muted small">
              {results.data.document.title} · provider {results.data.analysis.provider}
            </p>
            <div className="grid cols-4">
              {[
                ['Total', counts.total],
                ['Clear', counts.clear],
                ['Needs review', counts.needs_review],
                ['Safeguard removed', counts.safeguard_removed],
                ['Direct conflict', counts.direct_conflict],
                ['Pending review', counts.pending],
                ['Requiring review', counts.requires_review],
                ['Consistent', counts.consistent],
              ].map(([label, value]) => (
                <div className="stat" key={label}>
                  <div className="stat-value">{value}</div>
                  <div className="stat-label">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </>
  )
}
