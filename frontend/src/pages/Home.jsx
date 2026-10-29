import { Link } from 'react-router-dom'
import { api } from '../api'
import { Disclaimer, ErrorState } from '../components/Feedback'
import { useAsync } from '../components/hooks'
import { joinDocuments, splitAnalyses } from '../lib/analyses'

const STEPS = [
  {
    n: 1,
    title: 'Upload a PDF bill',
    body: 'Add a proposed law or draft bill. The server reads the text and splits it into clauses.',
  },
  {
    n: 2,
    title: 'We analyse each clause',
    body: 'Clauses are compared against existing provisions for conflicts, removed safeguards and rights flags.',
  },
  {
    n: 3,
    title: 'Review the findings',
    body: 'Read the evidence, then confirm or correct each prediction. Every decision is recorded.',
  },
]

/**
 * Landing page. Deliberately sparse: name, one paragraph, the upload call to
 * action, and the three-step workflow. Counts shown here are the user's own
 * analyses only - seeded demonstration data is never presented as theirs.
 */
export default function Home() {
  const { data, loading, error, refetch } = useAsync(
    () => Promise.all([api.listAnalyses({ limit: 100 }), api.listDocuments()]),
    [],
  )

  const rows = data ? joinDocuments(data[0], data[1]) : []
  const { user } = splitAnalyses(rows)
  const completed = user.filter((row) => row.status === 'completed')

  return (
    <div className="home">
      <section className="hero">
        <p className="eyebrow">Decision support for proposed Indian legislation</p>
        <h1>Rights Regression Radar</h1>
        <p className="hero-lede">
          Upload a proposed law or draft bill and see where it may conflict with existing
          provisions, weaken safeguards, or raise constitutional-rights questions — with the
          evidence for every finding and a place to record your own review.
        </p>
        <div className="btn-row">
          <Link className="btn primary large" to="/analyse">
            Upload a bill (PDF)
          </Link>
          {completed.length > 0 ? (
            <Link className="btn large" to="/analyses">
              View past analyses
            </Link>
          ) : null}
        </div>
        {!loading && completed.length > 0 ? (
          <p className="faint small mt-2">
            You have {completed.length} completed analys{completed.length === 1 ? 'is' : 'es'}.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="how-heading">
        <h2 id="how-heading">How it works</h2>
        <ol className="steps">
          {STEPS.map((step) => (
            <li key={step.n}>
              <span className="step-n" aria-hidden="true">
                {step.n}
              </span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {error ? (
        <ErrorState
          error={error}
          onRetry={refetch}
        />
      ) : null}

      <section className="home-note">
        <h2>What this tool is not</h2>
        <p className="muted">
          It does not give legal advice and never concludes that a provision is unconstitutional or
          legally invalid. Findings are prompts for a human reviewer, not verdicts.
        </p>
        <Disclaimer />
      </section>
    </div>
  )
}
