import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import {
  ConfidenceBadge,
  DemoBadge,
  HealthBadge,
  JobStatusBadge,
  LabelBadge,
  ReviewStatusBadge,
} from '../components/Badges'
import { Alert, EmptyState, ErrorState, Loading } from '../components/Feedback'
import { PageHeader } from '../components/Layout'
import { ReviewForm } from '../components/ReviewForm'
import { useAsync, usePolling } from '../components/hooks'
import { RIGHTS_SHORT } from '../constants'

const TERMINAL = ['completed', 'failed']

const TABS = [
  { id: 'conflicts', label: 'Conflicts' },
  { id: 'safeguards', label: 'Weakened safeguards' },
  { id: 'rights', label: 'Rights flags' },
  { id: 'review', label: 'Needs review' },
  { id: 'all', label: 'All clauses' },
]

const EMPTY_TEXT = {
  conflicts: 'No clause was classified as conflicting with an existing provision.',
  safeguards: 'No clause was flagged as removing or weakening a safeguard.',
  rights: 'No clause was tagged as relevant to Articles 14, 19 or 21.',
  review: 'Nothing is waiting for a human decision.',
  all: 'This analysis produced no findings.',
}

function matchesTab(finding, tab) {
  switch (tab) {
    case 'conflicts':
      return finding.predicted_label === 'conflicts'
    case 'safeguards':
      return finding.predicted_label === 'removes_safeguard'
    case 'rights':
      return (finding.rights_tags || []).length > 0
    case 'review':
      return finding.requires_review && finding.review_status === 'pending'
    default:
      return true
  }
}

function FindingCard({ finding, expanded, onToggle, onReviewed }) {
  const clause = finding.clause
  const provision = finding.provision
  return (
    <article className={`finding-card${expanded ? ' open' : ''}`}>
      <button type="button" className="finding-card-head" onClick={onToggle} aria-expanded={expanded}>
        <span className="finding-card-title">
          {clause?.section_id ? `Section ${clause.section_id}` : `Clause ${clause?.ordinal ?? '?'}`}
          {clause?.heading ? ` — ${clause.heading}` : ''}
        </span>
        <span className="badge-row">
          <LabelBadge label={finding.effective_label || finding.predicted_label} />
          <HealthBadge category={finding.health_category} />
          <ReviewStatusBadge status={finding.review_status} />
          {(finding.rights_tags || []).map((tag) => (
            <span className="badge accent" key={tag}>
              {RIGHTS_SHORT[tag]}
            </span>
          ))}
        </span>
        <span className="finding-card-caret" aria-hidden="true">
          {expanded ? '−' : '+'}
        </span>
      </button>

      {expanded ? (
        <div className="finding-card-body">
          <div className="finding-columns">
            <div>
              <h4>New clause</h4>
              <div className="clause-text">{clause?.text || '—'}</div>
            </div>
            <div>
              <h4>Earlier provision</h4>
              {provision ? (
                <div className="clause-text">
                  <strong>
                    {provision.act_title} · {provision.section_id}
                  </strong>
                  {'\n'}
                  {provision.text}
                </div>
              ) : (
                <EmptyState>No earlier provision was matched for this clause.</EmptyState>
              )}
            </div>
          </div>

          <p className="small muted">
            {finding.explanation || 'No explanation was produced for this finding.'}
          </p>

          <div className="card-header">
            <h4>Evidence and citations</h4>
            <span className="faint small">{finding.evidence.length} source(s)</span>
          </div>
          {finding.evidence.length === 0 ? (
            <Alert tone="warn" title="No evidence attached">
              This finding has no source-linked evidence. Choose “Insufficient evidence” if you
              cannot verify it.
            </Alert>
          ) : (
            finding.evidence.map((item) => (
              <div className="evidence" key={item.id}>
                <div className="badge-row">
                  <strong className="small">{item.source_title || 'Untitled source'}</strong>
                  {item.is_demonstration ? <DemoBadge label="demo source" /> : null}
                </div>
                <p className="small mono">{item.snippet}</p>
                <dl className="kv">
                  <dt>Section</dt>
                  <dd>{item.source_section || '—'}</dd>
                  <dt>Reference</dt>
                  <dd>{item.source_reference || 'not recorded'}</dd>
                  <dt>Link</dt>
                  <dd>
                    {item.source_url ? (
                      <a href={item.source_url} target="_blank" rel="noreferrer">
                        {item.source_url}
                      </a>
                    ) : (
                      'no source link recorded'
                    )}
                  </dd>
                  <dt>Retrieval score</dt>
                  <dd>
                    {item.retrieval_score === null || item.retrieval_score === undefined
                      ? 'not available'
                      : item.retrieval_score}
                  </dd>
                </dl>
              </div>
            ))
          )}

          {finding.evidence_sufficient === false ? (
            <Alert tone="warn" title="Evidence may be insufficient">
              The provider could not assemble sufficient evidence for this finding. Treat it as
              unverified until a reviewer confirms it.
            </Alert>
          ) : null}

          <div className="btn-row mb-2">
            <ConfidenceBadge value={finding.confidence} />
            <Link className="btn small" to={`/explorer?finding=${finding.id}`}>
              Open in clause explorer
            </Link>
          </div>

          <div className="card-header">
            <h4>Human review</h4>
            <span className="faint small">
              {finding.reviews.length} decision{finding.reviews.length === 1 ? '' : 's'} recorded
            </span>
          </div>
          <ReviewForm finding={finding} onSaved={onReviewed} compact />
        </div>
      ) : null}
    </article>
  )
}

/**
 * Dedicated results page for one analysis: conflicts, weakened safeguards,
 * rights flags, evidence and citations, and the human-review actions - all in
 * one place, with the deeper tools (explorer, health, implications) reachable
 * from the header and the secondary menu.
 */
export default function AnalysisResults() {
  const { id } = useParams()
  const [tab, setTab] = useState('conflicts')
  const [expandedId, setExpandedId] = useState(null)

  // SIMULATED JOB: status is polled while the background worker runs.
  // TODO(ML-INTEGRATION): switch to server-sent events if the provider streams
  // progressive results.
  const { data: analysis, error } = usePolling(() => api.getAnalysis(id), {
    intervalMs: 1200,
    shouldStop: (result) => TERMINAL.includes(result?.status),
  })

  const results = useAsync(() => api.getResults(id), [analysis?.status, id], {
    immediate: analysis?.status === 'completed',
  })

  const findings = useMemo(() => results.data?.findings || [], [results.data])

  useEffect(() => {
    // Open the first finding of a newly selected tab so the tab is never an
    // empty list with nothing to read.
    const first = findings.find((f) => matchesTab(f, tab))
    setExpandedId(first ? first.id : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, results.data])

  if (error && !analysis) {
    return (
      <>
        <PageHeader title="Analysis results" />
        <ErrorState error={error} />
        <Link to="/analyses">← Back to past analyses</Link>
      </>
    )
  }

  if (!analysis) return <Loading label="Loading analysis…" />

  const document = results.data?.document
  const counts = results.data?.counts
  const visible = findings.filter((f) => matchesTab(f, tab))

  return (
    <>
      <PageHeader title={document?.title || 'Analysis results'}>
        <p>
          {analysis.status === 'completed'
            ? 'Findings for this bill, grouped by what needs your attention.'
            : 'This analysis is still running. Results appear here when it finishes.'}
        </p>
      </PageHeader>

      {analysis.is_demonstration ? (
        <Alert tone="info" title="Demonstration analysis">
          {/* MOCK DATA: findings come from the mock provider over seeded fictional
              material, not from a trained model. */}
          This job was produced by the mock analysis provider using seeded fictional material.
          Findings are simulated and are not real AI analysis or legal advice.
        </Alert>
      ) : null}

      {analysis.status === 'failed' ? (
        <Alert tone="danger" title="Analysis failed">
          <span className="mono small">{analysis.error || 'No error detail was recorded.'}</span>
        </Alert>
      ) : null}

      <section className="card">
        <div className="card-header">
          <h2>Status</h2>
          <JobStatusBadge status={analysis.status} />
        </div>
        <div className="bar mb-1">
          <span style={{ width: `${analysis.progress}%` }} />
        </div>
        <dl className="kv">
          <dt>Clauses</dt>
          <dd>{analysis.clause_count}</dd>
          <dt>Findings</dt>
          <dd>{analysis.finding_count}</dd>
          <dt>Provider</dt>
          <dd>
            {analysis.provider}
            {analysis.is_demonstration ? ' (demonstration)' : ''}
          </dd>
          <dt>Started</dt>
          <dd>{analysis.started_at ? new Date(analysis.started_at).toLocaleString() : '—'}</dd>
          <dt>Finished</dt>
          <dd>{analysis.finished_at ? new Date(analysis.finished_at).toLocaleString() : '—'}</dd>
        </dl>
        <div className="btn-row mt-2">
          <Link className="btn small" to={`/health?analysis=${analysis.id}`}>
            Bill health
          </Link>
          <Link className="btn small" to={`/explorer?analysis=${analysis.id}`}>
            Clause explorer
          </Link>
          <Link className="btn small" to={`/implications?analysis=${analysis.id}`}>
            Implications
          </Link>
          <Link className="btn small" to={`/alerts?analysis=${analysis.id}`}>
            Safeguard &amp; rights alerts
          </Link>
          <Link className="btn small" to={`/review?analysis=${analysis.id}`}>
            Human review
          </Link>
          <Link className="btn small" to={`/documents/${analysis.document_id}`}>
            Document
          </Link>
        </div>
      </section>

      {analysis.status !== 'completed' ? (
        <Loading label="Waiting for the analysis to finish…" />
      ) : results.loading && !results.data ? (
        <Loading label="Loading findings…" />
      ) : results.error ? (
        <ErrorState error={results.error} onRetry={results.refetch} />
      ) : results.data ? (
        <>
          <section className="card">
            <h2>Summary</h2>
            <div className="summary-row">
              {[
                ['Conflicts', counts.conflicts, 'conflicts'],
                ['Weakened safeguards', counts.removes_safeguard, 'safeguards'],
                ['Rights flags', counts.rights_flagged ?? counts.requires_review, 'rights'],
                ['Needs review', counts.requires_review, 'review'],
              ].map(([label, value, target]) => (
                <button
                  type="button"
                  className={`summary-tile${tab === target ? ' active' : ''}`}
                  key={label}
                  onClick={() => setTab(target)}
                >
                  <span className="summary-value">{value ?? 0}</span>
                  <span className="summary-label">{label}</span>
                </button>
              ))}
            </div>
          </section>

          <div className="tabs" role="tablist" aria-label="Finding categories">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <EmptyState>{EMPTY_TEXT[tab]}</EmptyState>
          ) : (
            <div className="finding-list">
              {visible.map((finding) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  expanded={finding.id === expandedId}
                  onToggle={() =>
                    setExpandedId((current) => (current === finding.id ? null : finding.id))
                  }
                  onReviewed={async () => {
                    await results.refetch()
                  }}
                />
              ))}
            </div>
          )}
        </>
      ) : null}
    </>
  )
}
