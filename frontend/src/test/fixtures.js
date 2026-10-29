/**
 * Shared test fixtures. Shapes mirror the backend responses documented in
 * docs/SCHEMA.md. They are demonstration data, exactly as the API returns for
 * the seeded corpus.
 */

export const documentFixture = {
  id: 'doc1',
  title: 'Demonstration Streamlining of Licensing Bill (fictional)',
  filename: 'demo.pdf',
  status: 'analysed',
  page_count: 1,
  file_size: 2048,
  is_demonstration: true,
  version_label: '1.0 (demonstration)',
  document_date: null,
  legal_status: 'proposed (fictional)',
  source_reference: 'Generated demonstration document; not a real bill.',
  created_at: '2026-01-01T10:00:00Z',
  text: 'THE DEMONSTRATION BILL\n3. Amendment of section 9. No appeal shall lie.',
  content_type: 'application/pdf',
  clause_count: 2,
  analysis_count: 1,
  extraction_error: null,
}

export const clauseFixture = {
  id: 'clause1',
  document_id: 'doc1',
  ordinal: 1,
  section_id: '3',
  heading: 'Amendment of section 9',
  text: 'No appeal shall lie against an order made under this Act except with the leave of the licensing authority.',
  page_number: 1,
  char_start: 0,
  char_end: 110,
}

export const evidenceFixture = {
  id: 'ev1',
  finding_id: 'find1',
  kind: 'retrieved_provision',
  snippet: 'Any person aggrieved may prefer an appeal to the Appellate Authority.',
  source_title: 'Demonstration Protection of Livelihoods Act (fictional)',
  source_section: 'Section 9',
  source_reference: 'Fictional demonstration corpus entry; no real citation.',
  source_url: null,
  retrieval_score: 2.41,
  is_demonstration: true,
}

export const reviewFixture = {
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
}

export const findingFixture = {
  id: 'find1',
  analysis_id: 'ana1',
  document_id: 'doc1',
  clause_id: 'clause1',
  provision_id: 'prov1',
  predicted_label: 'removes_safeguard',
  effective_label: null,
  confidence: 0.74,
  explanation: 'The clause appears to weaken or remove a protection found in Section 9.',
  review_status: 'pending',
  health_category: 'safeguard_removed',
  rights_tags: ['article_21'],
  requires_review: true,
  evidence_sufficient: true,
  implications: {
    sufficient_evidence: true,
    message: 'Demonstration implications based on the predicted relationship.',
    benefits: ['May speed up decision-making by reducing procedural steps.'],
    drawbacks: ['Reduces the protections available to affected persons.'],
    affected_interests: ['Persons affected by the decision'],
  },
  created_at: '2026-01-01T10:05:00Z',
  clause: clauseFixture,
  provision: {
    id: 'prov1',
    act_title: 'Demonstration Protection of Livelihoods Act (fictional)',
    section_id: 'Section 9',
    heading: 'Right of appeal against an order',
    text: 'Any person aggrieved by an order may prefer an appeal to the Appellate Authority.',
    legal_status: 'in force',
    document_date: '1971-01-01',
    source_reference: 'Fictional demonstration corpus entry; no real citation.',
    source_url: null,
    is_demonstration: true,
  },
  evidence: [evidenceFixture],
  reviews: [],
  document_title: documentFixture.title,
}

export const analysisFixture = {
  id: 'ana1',
  document_id: 'doc1',
  status: 'completed',
  provider: 'mock',
  progress: 100,
  error: null,
  is_demonstration: true,
  clause_count: 2,
  finding_count: 1,
  started_at: '2026-01-01T10:00:01Z',
  finished_at: '2026-01-01T10:00:03Z',
  created_at: '2026-01-01T10:00:00Z',
}

export const metricsFixture = {
  model_name: 'relationship-classifier',
  model_version: 'demo-0.1',
  is_demonstration: true,
  labels: ['conflicts', 'removes_safeguard', 'consistent', 'unrelated'],
  per_class: [
    { label: 'conflicts', precision: 0.72, recall: 0.68, f1: 0.7, support: 64 },
    { label: 'removes_safeguard', precision: 0.69, recall: 0.74, f1: 0.71, support: 58 },
    { label: 'consistent', precision: 0.81, recall: 0.79, f1: 0.8, support: 132 },
    { label: 'unrelated', precision: 0.88, recall: 0.9, f1: 0.89, support: 246 },
  ],
  macro_f1: 0.775,
  accuracy: 0.842,
  micro_f1: 0.842,
  confusion_matrix: {
    labels: ['conflicts', 'removes_safeguard', 'consistent', 'unrelated'],
    matrix: [
      [43, 11, 4, 6],
      [9, 43, 2, 4],
      [6, 5, 104, 17],
      [2, 3, 20, 221],
    ],
  },
  test_set_size: 500,
  retrieval_recall_at_k: { k: 5, recall: 0.83, note: 'Demonstration value.' },
  human_review: { findings_total: 19, findings_reviewed: 0, review_rate: 0.0, decisions: {} },
}

export const dashboardFixture = {
  counts: {
    documents: 2,
    analyses: 2,
    findings: 19,
    pending_review: 19,
    rights_flagged: 3,
    failed_analyses: 0,
    active_analyses: 0,
  },
  health_breakdown: { clear: 5, needs_review: 9, safeguard_removed: 3, direct_conflict: 2 },
  rights_breakdown: { article_14: 0, article_19: 2, article_21: 1 },
  recent_documents: [documentFixture],
  recent_analyses: [analysisFixture],
  review_queue: [findingFixture],
}

export const auditFixture = {
  id: 'aud1',
  actor: 'reviewer-a',
  action: 'review.relabel',
  entity_type: 'finding',
  entity_id: 'find1',
  previous_value: '{"label": "removes_safeguard", "review_status": "pending"}',
  new_value: '{"label": "conflicts", "review_status": "relabelled"}',
  reason: 'Clause overrides the earlier provision expressly.',
  context: { review_id: 'rev1', predicted_label: 'removes_safeguard' },
  created_at: '2026-01-02T09:00:00Z',
}

export const diffFixture = {
  clause_id: 'clause1',
  finding_id: 'find1',
  provision: findingFixture.provision,
  segments: {
    old: [
      { type: 'equal', text: 'Any person aggrieved by an order ' },
      { type: 'removed', text: 'may prefer an appeal to the Appellate Authority.' },
    ],
    new: [
      { type: 'equal', text: 'Any person aggrieved by an order ' },
      { type: 'added', text: 'No appeal shall lie against an order made under this Act.' },
    ],
  },
  similarity: 0.31,
  is_demonstration: true,
}
