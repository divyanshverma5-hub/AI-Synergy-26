import { Link } from 'react-router-dom'
import { api } from '../api'
import { HEALTH_CATEGORIES, HEALTH_TEXT, RIGHTS_ARTICLES, RIGHTS_SHORT } from '../constants'
import {
  DemoBadge,
  HealthBadge,
  JobStatusBadge,
  LabelBadge,
  ReviewStatusBadge,
} from '../components/Badges'
import { Alert, EmptyState, ErrorState, Loading } from '../components/Feedback'
import { PageHeader } from '../components/Layout'
import { useAsync } from '../components/hooks'

function Stat({ value, label, to, hint }) {
  const inner = (
    <>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {hint ? <div className="faint small">{hint}</div> : null}
    </>
  )
  if (to) {
    return (
      <Link className="stat is-link" to={to}>
        {inner}
      </Link>
    )
  }
  return <div className="stat">{inner}</div>
}

export default function Dashboard() {
  const { data, error, loading, refetch } = useAsync(() => api.dashboard(), [])

  if (loading && !data) return <Loading label="Loading dashboard…" />

  return (
    <>
      <PageHeader title="Dashboard">
        <p>
          Uploaded bills, recent analyses, processing statuses and findings awaiting human
          review. All counts are computed from stored data.
        </p>
      </PageHeader>

      {error ? <ErrorState error={error} onRetry={refetch} /> : null}

      {data ? (
        <>
          <div className="grid cols-4 mb-2">
            <Stat
              value={data.counts.documents}
              label="Documents"
              to="/upload"
              hint="uploaded bills"
            />
            <Stat
              value={data.counts.analyses}
              label="Analyses"
              to="/health"
              hint={`${data.counts.active_analyses} running · ${data.counts.failed_analyses} failed`}
            />
            <Stat value={data.counts.findings} label="Findings" to="/explorer" />
            <Stat
              value={data.counts.pending_review}
              label="Requiring review"
              to="/review"
              hint="flagged for a human decision"
            />
          </div>

          <div className="card">
            <div className="card-header">
              <h2>Bill health summary</h2>
              <Link to="/health" className="small">
                Open clause map →
              </Link>
            </div>
            <p className="muted small">
              Categories are a presentation aid derived from predictions and settled reviewer
              decisions. They are not legal conclusions.
            </p>
            <div className="grid cols-4">
              {HEALTH_CATEGORIES.map((category) => (
                <div className="stat" key={category}>
                  <div className="stat-value">{data.health_breakdown[category] ?? 0}</div>
                  <div className="stat-label">{HEALTH_TEXT[category]}</div>
                </div>
              ))}
            </div>
            <div className="mt-2">
              <h3>Rights-relevant clauses</h3>
              <p className="muted small">
                Tagged as potentially relevant to a constitutional article. Tags flag clauses for
                mandatory human review; they are not conclusions about constitutionality.
              </p>
              <div className="badge-row">
                {RIGHTS_ARTICLES.map((article) => (
                  <Link
                    key={article}
                    to={`/alerts?rights=${article}`}
                    className="badge accent"
                    title={`View clauses tagged ${RIGHTS_SHORT[article]}`}
                  >
                    {RIGHTS_SHORT[article]}: {data.rights_breakdown[article] ?? 0}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="split mt-2">
            <div className="card">
              <div className="card-header">
                <h3>Recent documents</h3>
                <Link to="/upload" className="small">
                  Upload a bill →
                </Link>
              </div>
              {data.recent_documents.length === 0 ? (
                <EmptyState>
                  No documents yet. <Link to="/upload">Upload a PDF bill</Link> to begin.
                </EmptyState>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Status</th>
                        <th>Pages</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent_documents.map((doc) => (
                        <tr key={doc.id}>
                          <td>
                            <Link to={`/documents/${doc.id}`}>{doc.title}</Link>
                            {doc.is_demonstration ? (
                              <>
                                {' '}
                                <DemoBadge />
                              </>
                            ) : null}
                          </td>
                          <td>
                            <span className="badge neutral">{doc.status}</span>
                          </td>
                          <td>{doc.page_count}</td>
                          <td className="nowrap">
                            <Link to={`/health?document=${doc.id}`} className="small">
                              View findings
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-header">
                <h3>Recent analyses</h3>
                <Link to="/health" className="small">
                  All analyses →
                </Link>
              </div>
              {data.recent_analyses.length === 0 ? (
                <EmptyState>No analyses have been run yet.</EmptyState>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Job</th>
                        <th>Status</th>
                        <th>Findings</th>
                        <th>Provider</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent_analyses.map((analysis) => (
                        <tr key={analysis.id}>
                          <td className="mono">
                            <Link to={`/analyses/${analysis.id}`}>{analysis.id.slice(0, 8)}</Link>
                          </td>
                          <td>
                            <JobStatusBadge status={analysis.status} />
                          </td>
                          <td>{analysis.finding_count}</td>
                          <td className="small">
                            {analysis.provider}
                            {analysis.is_demonstration ? ' (demo)' : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="card mt-2">
            <div className="card-header">
              <h2>Findings requiring review</h2>
              <Link to="/review" className="small">
                Open review center →
              </Link>
            </div>
            {data.review_queue.length === 0 ? (
              <EmptyState>Nothing is waiting for review.</EmptyState>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Clause</th>
                      <th>Prediction</th>
                      <th>Health</th>
                      <th>Review</th>
                      <th>Rights</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.review_queue.map((finding) => (
                      <tr key={finding.id}>
                        <td className="mono">{finding.clause_id.slice(0, 8)}</td>
                        <td>
                          <LabelBadge label={finding.effective_label || finding.predicted_label} />
                        </td>
                        <td>
                          <HealthBadge category={finding.health_category} />
                        </td>
                        <td>
                          <ReviewStatusBadge status={finding.review_status} />
                        </td>
                        <td className="small">
                          {(finding.rights_tags || []).map((tag) => RIGHTS_SHORT[tag]).join(', ') || '—'}
                        </td>
                        <td className="nowrap">
                          <Link to={`/review?finding=${finding.id}`} className="small">
                            Review
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}

      <Alert tone="info" title="How to read this dashboard">
        Counts come from the database. Demonstration documents are tagged so fictional material
        is never confused with real legislation.
      </Alert>
    </>
  )
}
