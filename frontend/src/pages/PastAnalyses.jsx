import { Link } from 'react-router-dom'
import { api } from '../api'
import { DemoBadge, JobStatusBadge } from '../components/Badges'
import { Alert, EmptyState, ErrorState, Loading } from '../components/Feedback'
import { PageHeader } from '../components/Layout'
import { useAsync } from '../components/hooks'
import { joinDocuments, splitAnalyses } from '../lib/analyses'

function formatDate(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString()
}

function AnalysisRow({ row }) {
  const document = row.document
  return (
    <li className="analysis-item">
      <div className="analysis-item-main">
        <Link className="analysis-item-title" to={`/analyses/${row.id}`}>
          {document?.title || 'Untitled document'}
        </Link>
        <div className="faint small">
          {formatDate(row.created_at)} · {row.finding_count} finding
          {row.finding_count === 1 ? '' : 's'} · {row.clause_count} clause
          {row.clause_count === 1 ? '' : 's'}
        </div>
      </div>
      <div className="analysis-item-side">
        <JobStatusBadge status={row.status} />
        {document?.is_demonstration ? <DemoBadge /> : null}
      </div>
    </li>
  )
}

/**
 * Past Analyses lists every job the user has run. Seeded demonstration analyses
 * are shown in a separate, clearly labelled section so fictional results are
 * never mistaken for the user's own uploads.
 */
export default function PastAnalyses() {
  const analyses = useAsync(() => api.listAnalyses({ limit: 100 }), [])
  const documents = useAsync(() => api.listDocuments(), [])

  const loading = (analyses.loading && !analyses.data) || (documents.loading && !documents.data)
  const error = analyses.error || documents.error

  if (loading) return <Loading label="Loading past analyses…" />

  const rows = analyses.data && documents.data ? joinDocuments(analyses.data, documents.data) : []
  const { user, demo } = splitAnalyses(rows)
  const pending = user.filter((row) => row.status === 'queued' || row.status === 'processing')

  return (
    <>
      <PageHeader title="Past Analyses">
        <p>Every analysis you have run, newest first. Open one to read its findings.</p>
      </PageHeader>

      {error ? (
        <ErrorState
          error={error}
          onRetry={() => {
            analyses.refetch()
            documents.refetch()
          }}
        />
      ) : null}

      <div className="btn-row mb-2">
        <Link className="btn primary" to="/analyse">
          Analyse a new bill
        </Link>
        <button
          type="button"
          className="btn"
          onClick={() => {
            analyses.refetch()
            documents.refetch()
          }}
        >
          Refresh
        </button>
      </div>

      {pending.length > 0 ? (
        <Alert tone="info" title="Analysis in progress">
          {pending.length} job{pending.length === 1 ? ' is' : 's are'} still running. Open it to watch
          progress.
        </Alert>
      ) : null}

      <section className="card">
        <div className="card-header">
          <h2>Your analyses</h2>
          <span className="faint small">{user.length}</span>
        </div>
        {user.length === 0 ? (
          <EmptyState>
            You have not analysed a bill yet. <Link to="/analyse">Upload a PDF bill</Link> to start.
          </EmptyState>
        ) : (
          <ul className="analysis-list">
            {user.map((row) => (
              <AnalysisRow key={row.id} row={row} />
            ))}
          </ul>
        )}
      </section>

      {demo.length > 0 ? (
        <section className="card mt-2">
          <div className="card-header">
            <h2>
              Demonstration examples <DemoBadge />
            </h2>
            <span className="faint small">{demo.length}</span>
          </div>
          <p className="muted small">
            These jobs were run against the seeded fictional bills shipped with the app. They are
            not your uploads and are not real legislation or real model output.
          </p>
          <ul className="analysis-list">
            {demo.map((row) => (
              <AnalysisRow key={row.id} row={row} />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}
