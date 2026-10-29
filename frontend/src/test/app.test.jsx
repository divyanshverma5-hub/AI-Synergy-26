/**
 * Component and page tests. Every test drives the real component code against a
 * stubbed API layer, so the interactions under test are the ones users perform.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../App'
import * as apiModule from '../api'
import {
  analysisFixture,
  auditFixture,
  dashboardFixture,
  diffFixture,
  documentFixture,
  findingFixture,
  metricsFixture,
  userAnalysisFixture,
  userDocumentFixture,
} from './fixtures'

/**
 * Sets a file on a file input and fires the change event.
 *
 * `userEvent.upload` does not populate `input.files` under React 19 in this
 * toolchain, so the change event is dispatched directly. The component's own
 * handler runs unchanged, which is what these tests exercise.
 */
function selectFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

/** Installs a stubbed api object; individual tests override what they need. */
function stubApi(overrides = {}) {
  const stub = {
    health: vi.fn(async () => ({ status: 'ok' })),
    listDocuments: vi.fn(async () => [documentFixture, userDocumentFixture]),
    getDocument: vi.fn(async () => documentFixture),
    getClauses: vi.fn(async () => [findingFixture.clause]),
    getClauseDiff: vi.fn(async () => diffFixture),
    uploadDocument: vi.fn(async () => documentFixture),
    listAnalyses: vi.fn(async () => [analysisFixture, userAnalysisFixture]),
    createAnalysis: vi.fn(async () => analysisFixture),
    getAnalysis: vi.fn(async () => analysisFixture),
    getResults: vi.fn(async (id) => ({
      analysis: id === 'ana-user' ? userAnalysisFixture : analysisFixture,
      document: id === 'ana-user' ? userDocumentFixture : documentFixture,
      counts: {
        total: 1,
        conflicts: 0,
        removes_safeguard: 1,
        consistent: 0,
        unrelated: 0,
        requires_review: 1,
        pending: 1,
        clear: 0,
        needs_review: 0,
        safeguard_removed: 1,
        direct_conflict: 0,
      },
      findings: [findingFixture],
    })),
    listFindings: vi.fn(async (params = {}) => {
      // Mirror the server: `q` is a substring filter over clause text.
      const haystack = `${findingFixture.clause?.heading || ''} ${
        findingFixture.clause?.text || ''
      }`.toLowerCase()
      const matches = !params.q || haystack.includes(params.q.toLowerCase())
      const items = matches ? [findingFixture] : []
      return { items, total: items.length, page: 1, page_size: 10, pages: 1 }
    }),
    getFinding: vi.fn(async () => findingFixture),
    listReviews: vi.fn(async () => ({ items: [], total: 0, page: 1, page_size: 25, pages: 1 })),
    createReview: vi.fn(async () => ({ id: 'rev-new', decision: 'confirm' })),
    trainingExport: vi.fn(async () => ({ count: 0, records: [], note: 'no auto-retraining' })),
    auditLog: vi.fn(async () => ({
      items: [auditFixture],
      total: 1,
      page: 1,
      page_size: 20,
      pages: 1,
    })),
    metrics: vi.fn(async () => metricsFixture),
    dashboard: vi.fn(async () => dashboardFixture),
    ...overrides,
  }
  vi.spyOn(apiModule, 'api', 'get').mockReturnValue(stub)
  return stub
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('navigation', () => {
  it('shows only Home, Analyse a Bill and Past Analyses in the main navigation', async () => {
    stubApi()
    renderApp('/')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    for (const label of ['Home', 'Analyse a Bill', 'Past Analyses']) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument()
    }
    // The deeper tools must no longer clutter the primary navigation.
    for (const label of ['Bill health', 'Clause explorer', 'Model metrics', 'Audit log']) {
      expect(within(nav).queryByRole('link', { name: label })).not.toBeInTheDocument()
    }
    expect(screen.getAllByText(/does not provide legal advice/i).length).toBeGreaterThan(0)
  })

  it('opens the secondary tools menu and navigates to a tool', async () => {
    stubApi()
    const user = userEvent.setup()
    renderApp('/')
    const nav = screen.getByRole('navigation', { name: 'Main' })

    await user.click(within(nav).getByRole('button', { name: /More tools/i }))
    const menu = await screen.findByRole('menu', { name: /More tools/i })
    expect(within(menu).getByRole('menuitem', { name: 'Model metrics' })).toBeInTheDocument()

    await user.click(within(menu).getByRole('menuitem', { name: 'Audit log' }))
    expect(await screen.findByRole('heading', { name: /Audit log/i })).toBeInTheDocument()
  })

  it('redirects the legacy upload path to Analyse a Bill', async () => {
    stubApi()
    renderApp('/upload')
    expect(await screen.findByRole('heading', { name: 'Analyse a Bill' })).toBeInTheDocument()
  })

  it('shows a not-found page for an unknown route', async () => {
    stubApi()
    renderApp('/nope')
    expect(await screen.findByRole('heading', { name: /page not found/i })).toBeInTheDocument()
  })
})

describe('home', () => {
  it('shows the project name, explanation, upload button and three-step workflow', async () => {
    stubApi()
    renderApp('/')
    expect(
      await screen.findByRole('heading', { name: 'Rights Regression Radar' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Upload a bill \(PDF\)/i })).toHaveAttribute(
      'href',
      '/analyse',
    )
    expect(screen.getByRole('heading', { name: /How it works/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Upload a PDF bill/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /We analyse each clause/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Review the findings/i })).toBeInTheDocument()
  })

  it('surfaces a backend failure with a retry control', async () => {
    stubApi({
      listAnalyses: vi.fn(async () => {
        throw new apiModule.ApiError('Could not reach the backend.', 0)
      }),
    })
    renderApp('/')
    expect(await screen.findByText(/Could not reach the backend/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Try again/i })).toBeInTheDocument()
  })
})

describe('past analyses', () => {
  it("lists the user's own analyses separately from demonstration examples", async () => {
    stubApi()
    renderApp('/analyses')
    expect(await screen.findByRole('heading', { name: 'Past Analyses' })).toBeInTheDocument()

    const mine = screen.getByRole('heading', { name: /Your analyses/i }).closest('section')
    expect(within(mine).getByRole('link', { name: 'My Uploaded Test Bill' })).toBeInTheDocument()
    // The seeded demonstration bill must NOT be presented as the user's own.
    expect(
      within(mine).queryByRole('link', { name: documentFixture.title }),
    ).not.toBeInTheDocument()

    const demo = screen
      .getByRole('heading', { name: /Demonstration examples/i })
      .closest('section')
    expect(within(demo).getByRole('link', { name: documentFixture.title })).toBeInTheDocument()
  })

  it('shows an empty state when the user has no analyses of their own', async () => {
    stubApi({ listAnalyses: vi.fn(async () => [analysisFixture]) })
    renderApp('/analyses')
    expect(await screen.findByText(/You have not analysed a bill yet/i)).toBeInTheDocument()
  })
})

describe('upload', () => {
  it('rejects a non-PDF file before calling the API', async () => {
    const stub = stubApi()
    const user = userEvent.setup()
    renderApp('/upload')

    const input = await screen.findByLabelText(/PDF file/i)
    selectFile(input, new File(['hello'], 'notes.txt', { type: 'text/plain' }))

    expect(await screen.findByText(/Only PDF files are accepted/)).toBeInTheDocument()
    expect(stub.uploadDocument).not.toHaveBeenCalled()
  })

  it('uploads a valid PDF and starts an analysis', async () => {
    const stub = stubApi()
    const user = userEvent.setup()
    renderApp('/upload')

    const input = await screen.findByLabelText(/PDF file/i)
    selectFile(input, new File(['%PDF-1.4 fake'], 'bill.pdf', { type: 'application/pdf' }))
    await user.click(screen.getByRole('button', { name: /Upload PDF/i }))

    await waitFor(() => expect(stub.uploadDocument).toHaveBeenCalled())
    await waitFor(() => expect(stub.createAnalysis).toHaveBeenCalledWith({ document_id: 'doc1' }))
  })

  it('lets the user turn off automatic analysis', async () => {
    const stub = stubApi()
    const user = userEvent.setup()
    renderApp('/upload')

    const input = await screen.findByLabelText(/PDF file/i)
    selectFile(input, new File(['%PDF-1.4'], 'bill.pdf', { type: 'application/pdf' }))
    await user.click(screen.getByLabelText(/Start analysis immediately/i))
    await user.click(screen.getByRole('button', { name: /Upload PDF/i }))

    await waitFor(() => expect(stub.uploadDocument).toHaveBeenCalled())
    expect(stub.createAnalysis).not.toHaveBeenCalled()
    expect(await screen.findByText(/Upload complete/i)).toBeInTheDocument()
  })
})

describe('analysis results', () => {
  it('shows conflicts, safeguards, rights flags and evidence for a completed job', async () => {
    stubApi()
    renderApp('/analyses/ana1')

    expect(await screen.findByRole('heading', { name: documentFixture.title })).toBeInTheDocument()
    expect(screen.getAllByText('completed').length).toBeGreaterThan(0)
    expect(await screen.findByText(/Demonstration analysis/i)).toBeInTheDocument()

    // Category tabs are present and switch the visible findings.
    const tabs = screen.getByRole('tablist', { name: /Finding categories/i })
    expect(within(tabs).getByRole('tab', { name: 'Conflicts' })).toBeInTheDocument()
    expect(within(tabs).getByRole('tab', { name: 'Weakened safeguards' })).toBeInTheDocument()
    expect(within(tabs).getByRole('tab', { name: 'Rights flags' })).toBeInTheDocument()

    // The seeded finding is a weakened safeguard, so that tab lists it.
    await userEvent.setup().click(within(tabs).getByRole('tab', { name: 'Weakened safeguards' }))
    expect(await screen.findByText(/Removes safeguard/i)).toBeInTheDocument()

    // The first finding of a tab opens automatically, revealing evidence and
    // the review actions without an extra click.
    expect(await screen.findByText(/Evidence and citations/i)).toBeInTheDocument()
    expect(screen.getByText(/Demo source/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save decision/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open in clause explorer/i })).toBeInTheDocument()

    // Collapsing and re-opening the card works both ways.
    const header = screen.getByRole('button', { name: /Section 3 — Amendment of section 9/i })
    await userEvent.setup().click(header)
    await waitFor(() =>
      expect(screen.queryByText(/Evidence and citations/i)).not.toBeInTheDocument(),
    )
  })

  it('shows an empty state for a category with no findings', async () => {
    stubApi()
    renderApp('/analyses/ana1')
    const tabs = await screen.findByRole('tablist', { name: /Finding categories/i })
    await userEvent.setup().click(within(tabs).getByRole('tab', { name: 'Conflicts' }))
    expect(
      await screen.findByText(/No clause was classified as conflicting/i),
    ).toBeInTheDocument()
  })

  it('explains a failed job and shows the recorded error', async () => {
    stubApi({
      getAnalysis: vi.fn(async () => ({
        ...analysisFixture,
        status: 'failed',
        progress: 10,
        error: 'REAL_ANALYSIS_ENDPOINT is not configured.',
      })),
    })
    renderApp('/analyses/ana1')
    expect(await screen.findByText(/Analysis failed/i)).toBeInTheDocument()
    expect(screen.getByText(/REAL_ANALYSIS_ENDPOINT is not configured/)).toBeInTheDocument()
  })
})

describe('bill health', () => {
  it('lists clauses and filters by health category', async () => {
    const stub = stubApi()
    const user = userEvent.setup()
    renderApp('/health')

    expect(await screen.findByRole('heading', { name: /Bill health summary/i })).toBeInTheDocument()
    expect(await screen.findByText(/Section 3/)).toBeInTheDocument()

    await user.click(screen.getByTitle('Filter by Clear'))
    await waitFor(() => expect(screen.getByText(/No clauses match the current filters/)).toBeInTheDocument())
    expect(stub.getResults).toHaveBeenCalled()
  })

  it('opens a selected clause with actions that navigate', async () => {
    stubApi()
    const user = userEvent.setup()
    renderApp('/health')

    await user.click(await screen.findByRole('button', { name: 'Details' }))
    expect(screen.getByRole('link', { name: /Open in clause explorer/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Review this finding/i })).toBeInTheDocument()
  })
})

describe('clause explorer', () => {
  it('shows the diff with removed and added highlighting', async () => {
    stubApi()
    renderApp('/explorer')

    expect(await screen.findByRole('heading', { name: /Clause explorer/i })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/Side-by-side comparison/i)).toBeInTheDocument())

    const removed = document.querySelector('mark.removed')
    const added = document.querySelector('mark.added')
    expect(removed).not.toBeNull()
    expect(added).not.toBeNull()
    expect(removed.textContent).toMatch(/may prefer an appeal/)
    expect(added.textContent).toMatch(/No appeal shall lie/)
  })

  it('filters by label and by search text', async () => {
    const stub = stubApi()
    const user = userEvent.setup()
    renderApp('/explorer')

    await screen.findByRole('heading', { name: /Clause explorer/i })
    await user.selectOptions(screen.getByLabelText(/Predicted label/i), 'conflicts')
    await waitFor(() =>
      expect(stub.listFindings).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'conflicts' }),
      ),
    )

    await user.type(screen.getByLabelText(/Search clause text/i), 'zzzz-no-match')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    // The query is sent to the server, which filters across all findings.
    await waitFor(() =>
      expect(stub.listFindings).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'zzzz-no-match' }),
      ),
    )
    expect(await screen.findByText(/No findings match/i)).toBeInTheDocument()
  })

  it('shows an unavailable message when no provision is matched', async () => {
    stubApi({
      getClauseDiff: vi.fn(async () => {
        throw new apiModule.ApiError('No matched earlier provision is available.', 404)
      }),
    })
    renderApp('/explorer')
    expect(await screen.findByText(/No matched provision/i)).toBeInTheDocument()
  })
})

describe('alerts', () => {
  it('switches between safeguard and rights views', async () => {
    const stub = stubApi()
    const user = userEvent.setup()
    renderApp('/alerts')

    expect(await screen.findByText(/Safeguard alerts/i)).toBeInTheDocument()
    expect(stub.listFindings).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'removes_safeguard' }),
    )

    await user.click(screen.getByRole('tab', { name: /Rights-relevant clauses/i }))
    await waitFor(() =>
      expect(stub.listFindings).toHaveBeenCalledWith(
        expect.objectContaining({ rights_tag: undefined }),
      ),
    )
    expect(await screen.findByText(/Rights tags are review triggers/i)).toBeInTheDocument()
  })

  it('filters by article and explains tags are not conclusions', async () => {
    const stub = stubApi()
    const user = userEvent.setup()
    renderApp('/alerts?mode=rights')

    await user.selectOptions(await screen.findByLabelText(/Article/i), 'article_21')
    await waitFor(() =>
      expect(stub.listFindings).toHaveBeenCalledWith(
        expect.objectContaining({ rights_tag: 'article_21' }),
      ),
    )
    expect(screen.getByText(/It does not mean the clause violates the Constitution/i)).toBeInTheDocument()
  })
})

describe('review center', () => {
  it('submits a confirm decision and refreshes the queue', async () => {
    const stub = stubApi()
    const user = userEvent.setup()
    renderApp('/review')

    expect(await screen.findByRole('heading', { name: /Human review center/i })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /Save decision/i }))

    await waitFor(() =>
      expect(stub.createReview).toHaveBeenCalledWith(
        expect.objectContaining({ finding_id: 'find1', decision: 'confirm' }),
      ),
    )
    expect(await screen.findByText(/Saved a/i)).toBeInTheDocument()
  })

  it('requires a reason before a relabel can be saved', async () => {
    const stub = stubApi()
    const user = userEvent.setup()
    renderApp('/review')

    await screen.findByRole('heading', { name: /Human review center/i })
    await screen.findByRole('button', { name: /Save decision/i })
    await user.selectOptions(screen.getByLabelText(/^Decision/i), 'relabel')

    const save = screen.getByRole('button', { name: /Save decision/i })
    expect(save).toBeDisabled()
    expect(screen.getByText(/A reason is required for this decision type/i)).toBeInTheDocument()
    expect(stub.createReview).not.toHaveBeenCalled()
  })

  it('sends the corrected label when relabelling', async () => {
    const stub = stubApi()
    const user = userEvent.setup()
    renderApp('/review')

    await screen.findByRole('heading', { name: /Human review center/i })
    await screen.findByRole('button', { name: /Save decision/i })
    await user.selectOptions(screen.getByLabelText(/^Decision/i), 'relabel')
    await user.selectOptions(screen.getByLabelText(/Corrected label/i), 'conflicts')
    await user.type(screen.getByLabelText(/^Reason/i), 'Overrides the earlier provision.')
    await user.click(screen.getByRole('button', { name: /Save decision/i }))

    await waitFor(() =>
      expect(stub.createReview).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: 'relabel',
          updated_label: 'conflicts',
          reason: 'Overrides the earlier provision.',
        }),
      ),
    )
  })

  it('shows the recorded decision history', async () => {
    stubApi({
      getFinding: vi.fn(async () => ({
        ...findingFixture,
        review_status: 'relabelled',
        effective_label: 'conflicts',
        reviews: [
          {
            id: 'rev1',
            finding_id: 'find1',
            reviewer: 'reviewer-a',
            decision: 'relabel',
            previous_label: 'removes_safeguard',
            updated_label: 'conflicts',
            reason: 'Clause overrides the earlier provision expressly.',
            notes: '',
            is_usable_for_training: true,
            created_at: '2026-01-02T09:00:00Z',
          },
        ],
      })),
    })
    renderApp('/review')
    expect(await screen.findByText(/Decision history/i)).toBeInTheDocument()
    expect(screen.getByText(/Clause overrides the earlier provision expressly/)).toBeInTheDocument()
    expect(screen.getAllByText(/usable for future training/i).length).toBeGreaterThan(0)
  })

  it('shows a clear error when the API rejects the decision', async () => {
    stubApi({
      createReview: vi.fn(async () => {
        throw new apiModule.ApiError('finding not found', 404)
      }),
    })
    const user = userEvent.setup()
    renderApp('/review')

    await screen.findByRole('heading', { name: /Human review center/i })
    await user.click(await screen.findByRole('button', { name: /Save decision/i }))
    expect(await screen.findByText(/finding not found/i)).toBeInTheDocument()
  })
})

describe('implications', () => {
  it('shows benefits, drawbacks and affected interests when evidence is sufficient', async () => {
    stubApi()
    renderApp('/implications')
    expect(await screen.findByRole('heading', { name: 'Implications' })).toBeInTheDocument()
    expect(await screen.findByText(/May speed up decision-making/i)).toBeInTheDocument()
    expect(screen.getByText(/Reduces the protections available/i)).toBeInTheDocument()
  })

  it('states that evidence is insufficient instead of inventing a conclusion', async () => {
    stubApi({
      listFindings: vi.fn(async () => ({
        items: [
          {
            ...findingFixture,
            implications: {
              sufficient_evidence: false,
              message: 'Insufficient evidence to determine the implications of this clause.',
              benefits: [],
              drawbacks: [],
              affected_interests: [],
            },
          },
        ],
        total: 1,
        page: 1,
        page_size: 10,
        pages: 1,
      })),
    })
    renderApp('/implications')
    expect(
      await screen.findByText(/Insufficient evidence to determine the implications/i),
    ).toBeInTheDocument()
  })
})

describe('model metrics', () => {
  it('labels demonstration metrics and renders per-class values', async () => {
    stubApi()
    renderApp('/metrics')
    expect(await screen.findByRole('heading', { name: 'Model metrics' })).toBeInTheDocument()
    expect(await screen.findByText(/Demonstration metrics/i)).toBeInTheDocument()
    expect(screen.getAllByText('84.2%').length).toBeGreaterThan(0)
    expect(screen.getByText('77.5%')).toBeInTheDocument()
    expect(screen.getByText(/Rows are true labels/)).toBeInTheDocument()
    expect(screen.getByText('83.0%')).toBeInTheDocument()
  })

  it('handles missing metrics without fabricating values', async () => {
    stubApi({
      metrics: vi.fn(async () => ({
        model_name: 'relationship-classifier',
        model_version: 'unavailable',
        is_demonstration: true,
        labels: ['conflicts', 'removes_safeguard', 'consistent', 'unrelated'],
        per_class: [
          { label: 'conflicts', precision: null, recall: null, f1: null, support: null },
          { label: 'removes_safeguard', precision: null, recall: null, f1: null, support: null },
          { label: 'consistent', precision: null, recall: null, f1: null, support: null },
          { label: 'unrelated', precision: null, recall: null, f1: null, support: null },
        ],
        macro_f1: null,
        accuracy: null,
        micro_f1: null,
        confusion_matrix: { labels: [], matrix: [] },
        test_set_size: null,
        retrieval_recall_at_k: {},
        human_review: { note: 'No metrics have been imported yet.' },
      })),
    })
    renderApp('/metrics')
    expect(await screen.findByText(/No metrics have been imported yet/i)).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})

describe('audit log', () => {
  it('renders entries with previous and updated values', async () => {
    stubApi()
    renderApp('/audit')
    expect(await screen.findByRole('heading', { name: 'Audit log' })).toBeInTheDocument()
    expect((await screen.findAllByText('review.relabel')).length).toBeGreaterThan(0)
    expect(screen.getByText(/from:/)).toBeInTheDocument()
    expect(screen.getByText(/to:/)).toBeInTheDocument()
    expect(screen.getByText(/never edited or deleted/i)).toBeInTheDocument()
  })

  it('filters by action through the API', async () => {
    const stub = stubApi()
    const user = userEvent.setup()
    renderApp('/audit')

    await screen.findByRole('heading', { name: 'Audit log' })
    await user.selectOptions(screen.getByLabelText(/^Action/i), 'review.confirm')
    await waitFor(() =>
      expect(stub.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'review.confirm' }),
      ),
    )
  })
})

describe('document detail', () => {
  it('shows metadata and lets the user toggle the extracted text', async () => {
    stubApi()
    const user = userEvent.setup()
    renderApp('/documents/doc1')

    expect(await screen.findByRole('heading', { name: documentFixture.title })).toBeInTheDocument()
    expect(screen.getByText(/proposed \(fictional\)/)).toBeInTheDocument()

    expect(screen.queryByLabelText(/Extracted document text/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Show extracted text/i }))
    expect(await screen.findByLabelText(/Extracted document text/i)).toBeInTheDocument()
  })

  it('starts an analysis from the document page', async () => {
    const stub = stubApi()
    const user = userEvent.setup()
    renderApp('/documents/doc1')

    await screen.findByRole('heading', { name: documentFixture.title })
    await user.click(screen.getByRole('button', { name: /Run analysis/i }))
    await waitFor(() => expect(stub.createAnalysis).toHaveBeenCalledWith({ document_id: 'doc1' }))
  })
})
