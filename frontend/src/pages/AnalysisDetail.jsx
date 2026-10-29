import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { JobStatusBadge } from '../components/Badges'
import { Alert, ErrorState, Loading } from '../components/Feedback'
import { PageHeader } from '../components/Layout'
import { useAsync, usePolling } from '../components/hooks'

const TERMINAL = ['completed', 'failed']

export default function AnalysisDetail() {
  const { id } = useParams()

  // SIMULATED JOB: status is polled while the background worker runs.
  // TODO(ML-INTEGRATION): switch to server-sent events if the provider streams
  // progressive results.
  const { data: analysis, error } = usePolling(() => api.getAnalysis(id), {
    intervalMs: 1200,
    shouldStop: (result) => TERMINAL.includes(result?.status),
  })

  const results = useAsync(
    () => api.getResults(id),
    [analysis?.status, id],
    { immediate: analysis?.status === 'completed' },
  )

  if (error && !analysis) {
    return (
      <>
        <PageHeader title="Analysis job" />
        <ErrorState error={error} />
        <Link to="/upload">← Back</Link>
      </>
    )
  }

  if (!analysis) return <Loading label="Loading analysis job…" />

  return (
    <>
      <PageHeader title="Analysis job">
        <p>
          <span className="mono">{analysis.id}</span> · provider{' '}
          <strong>{analysis.provider}</strong>
          {analysis.is_demonstration ? ' (demonstration)' : ''}
        </p>
      </PageHeader>

      {analysis.is_demonstration ? (
        <Alert tone="info" title="Demonstration analysis">
          This job was produced by the mock analysis provider. Findings are simulated from seeded
          fictional material and are not the output of a trained model.
        </Alert>
      ) : null}

      <div className="card">
        <div className="card-header">
          <h2>Status</h2>
          <JobStatusBadge status={analysis.status} />
        </div>
        <div className="bar mb-1">
          <span style={{ width: `${analysis.progress}%` }} />
        </div>
        <dl className="kv">
          <dt>Progress</dt>
          <dd>{analysis.progress}%</dd>
          <dt>Clauses</dt>
          <dd>{analysis.clause_count}</dd>
          <dt>Findings</dt>
          <dd>{analysis.finding_count}</dd>
          <dt>Created</dt>
          <dd>{new Date(analysis.created_at).toLocaleString()}</dd>
          <dt>Started</dt>
          <dd>{analysis.started_at ? new Date(analysis.started_at).toLocaleString() : '—'}</dd>
          <dt>Finished</dt>
          <dd>{analysis.finished_at ? new Date(analysis.finished_at).toLocaleString() : '—'}</dd>
        </dl>

        {analysis.status === 'failed' ? (
          <Alert tone="danger" title="Analysis failed">
            <span className="mono small">{analysis.error || 'No error detail was recorded.'}</span>
          </Alert>
        ) : null}

        {!TERMINAL.includes(analysis.status) ? (
          <p className="muted small">
            The job is {analysis.status}. This page updates automatically.
          </p>
        ) : null}

        <div className="btn-row mt-2">
          <Link className="btn primary" to={`/health?analysis=${analysis.id}`}>
            Bill health summary
          </Link>
          <Link className="btn" to={`/explorer?analysis=${analysis.id}`}>
            Clause explorer
          </Link>
          <Link className="btn" to={`/documents/${analysis.document_id}`}>
            Document
          </Link>
        </div>
      </div>

      {analysis.status === 'completed' ? (
        <div className="card">
          <div className="card-header">
            <h2>Result summary</h2>
            <button type="button" className="btn small" onClick={results.refetch}>
              Refresh
            </button>
          </div>
          {results.loading && !results.data ? <Loading /> : null}
          {results.error ? <ErrorState error={results.error} onRetry={results.refetch} /> : null}
          {results.data ? (
            <>
              <div className="grid cols-4">
                {[
                  ['Total findings', results.data.counts.total],
                  ['Conflicts', results.data.counts.conflicts],
                  ['Removes safeguard', results.data.counts.removes_safeguard],
                  ['Consistent', results.data.counts.consistent],
                  ['Unrelated', results.data.counts.unrelated],
                  ['Requiring review', results.data.counts.requires_review],
                  ['Direct conflict', results.data.counts.direct_conflict],
                  ['Safeguard removed', results.data.counts.safeguard_removed],
                ].map(([label, value]) => (
                  <div className="stat" key={label}>
                    <div className="stat-value">{value}</div>
                    <div className="stat-label">{label}</div>
                  </div>
                ))}
              </div>
              <p className="muted small mt-2">
                Counts are computed from stored findings. Labels reflect settled reviewer
                decisions where they exist.
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
