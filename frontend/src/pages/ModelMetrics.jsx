import { api } from '../api'
import { LABEL_TEXT } from '../constants'
import { Badge } from '../components/Badges'
import { Alert, ErrorState, Loading } from '../components/Feedback'
import { PageHeader } from '../components/Layout'
import { useAsync } from '../components/hooks'

const percent = (value) =>
  value === null || value === undefined ? '—' : `${(value * 100).toFixed(1)}%`

function MetricBar({ value }) {
  if (value === null || value === undefined) return <span className="muted">—</span>
  return (
    <div className="bar" title={`${(value * 100).toFixed(1)}%`}>
      <span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  )
}

export default function ModelMetrics() {
  const { data, error, loading, refetch } = useAsync(() => api.metrics(), [])

  if (loading && !data) return <Loading label="Loading metrics…" />

  return (
    <>
      <PageHeader title="Model metrics">
        <p>
          Per-class precision, recall and F1 for the four-class relationship classifier, plus
          aggregate figures, retrieval recall and human-review rates.
        </p>
      </PageHeader>

      {error ? <ErrorState error={error} onRetry={refetch} /> : null}

      {data ? (
        <>
          {data.is_demonstration ? (
            <Alert tone="warn" title="Demonstration metrics">
              {/* MOCK METRICS: Replace with the actual model evaluation report. */}
              These numbers are placeholders seeded for the demonstration build. They do not
              describe a trained model and must not be quoted as real performance figures.
            </Alert>
          ) : null}

          <div className="card">
            <div className="card-header">
              <h2>Classifier</h2>
              <div className="badge-row">
                <Badge tone="neutral">{data.model_name}</Badge>
                <Badge tone="accent">{data.model_version}</Badge>
                {data.is_demonstration ? <Badge tone="warn">demonstration</Badge> : null}
              </div>
            </div>
            <div className="grid cols-4">
              <div className="stat">
                <div className="stat-value">{percent(data.accuracy)}</div>
                <div className="stat-label">Accuracy</div>
              </div>
              <div className="stat">
                <div className="stat-value">{percent(data.macro_f1)}</div>
                <div className="stat-label">Macro F1</div>
              </div>
              <div className="stat">
                <div className="stat-value">{percent(data.micro_f1)}</div>
                <div className="stat-label">Micro F1</div>
              </div>
              <div className="stat">
                <div className="stat-value">{data.test_set_size ?? '—'}</div>
                <div className="stat-label">Test set size</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2>Per-class metrics</h2>
            </div>
            <div className="table-wrap">
              <table className="metrics-table">
                <thead>
                  <tr>
                    <th>Label</th>
                    <th className="num">Precision</th>
                    <th className="num">Recall</th>
                    <th className="num">F1</th>
                    <th>F1</th>
                    <th className="num">Support</th>
                  </tr>
                </thead>
                <tbody>
                  {data.per_class.map((row) => (
                    <tr key={row.label}>
                      <td>{LABEL_TEXT[row.label] || row.label}</td>
                      <td className="num">{percent(row.precision)}</td>
                      <td className="num">{percent(row.recall)}</td>
                      <td className="num">{percent(row.f1)}</td>
                      <td>
                        <MetricBar value={row.f1} />
                      </td>
                      <td className="num">{row.support ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="split">
            <div className="card">
              <div className="card-header">
                <h2>Confusion matrix</h2>
              </div>
              <p className="muted small">Rows are true labels, columns are predicted labels.</p>
              {data.confusion_matrix?.matrix?.length ? (
                <div className="table-wrap">
                  <table className="metrics-table">
                    <thead>
                      <tr>
                        <th>true \ pred</th>
                        {data.confusion_matrix.labels.map((label) => (
                          <th key={label} className="num">
                            {LABEL_TEXT[label] || label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.confusion_matrix.matrix.map((row, rowIndex) => (
                        <tr key={data.confusion_matrix.labels[rowIndex]}>
                          <td>{LABEL_TEXT[data.confusion_matrix.labels[rowIndex]] || data.confusion_matrix.labels[rowIndex]}</td>
                          {row.map((cell, columnIndex) => (
                            <td className="num" key={columnIndex}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">No confusion matrix has been imported.</p>
              )}
            </div>

            <div>
              <div className="card">
                <div className="card-header">
                  <h2>Retrieval recall</h2>
                </div>
                {Object.keys(data.retrieval_recall_at_k || {}).length === 0 ? (
                  <p className="muted small">No retrieval evaluation has been imported.</p>
                ) : (
                  <dl className="kv">
                    <dt>k</dt>
                    <dd>{data.retrieval_recall_at_k.k ?? '—'}</dd>
                    <dt>Recall@k</dt>
                    <dd>{percent(data.retrieval_recall_at_k.recall)}</dd>
                    <dt>Note</dt>
                    <dd>{data.retrieval_recall_at_k.note || '—'}</dd>
                  </dl>
                )}
              </div>

              <div className="card">
                <div className="card-header">
                  <h2>Human review</h2>
                </div>
                <dl className="kv">
                  <dt>Findings</dt>
                  <dd>{data.human_review.findings_total ?? '—'}</dd>
                  <dt>Reviewed</dt>
                  <dd>{data.human_review.findings_reviewed ?? '—'}</dd>
                  <dt>Review rate</dt>
                  <dd>{percent(data.human_review.review_rate)}</dd>
                </dl>
                {data.human_review.decisions ? (
                  <div className="mt-1">
                    <h4>Decisions</h4>
                    <div className="badge-row">
                      {Object.entries(data.human_review.decisions).map(([decision, count]) => (
                        <Badge key={decision} tone="neutral">
                          {decision}: {count}
                        </Badge>
                      ))}
                      {Object.keys(data.human_review.decisions).length === 0 ? (
                        <span className="muted small">No decisions recorded yet.</span>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="muted small">{data.human_review.note}</p>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  )
}
