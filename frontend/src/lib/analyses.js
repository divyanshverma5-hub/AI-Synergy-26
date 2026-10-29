/**
 * Helpers for telling a user's own analysis apart from seeded demonstration
 * material.
 *
 * An analysis row carries a `document_id` but not the document's demonstration
 * flag, so the flag is joined in from the documents list. A "user analysis" is
 * one run against a document the user uploaded; the seeded demonstration bills
 * are excluded so fictional findings are never presented as the user's own
 * results.
 */

export const USER_ANALYSES_PAGE_SIZE = 100

export function joinDocuments(analyses, documents) {
  const byId = new Map((documents || []).map((doc) => [doc.id, doc]))
  return (analyses || []).map((analysis) => {
    const document = byId.get(analysis.document_id) || null
    // A missing document is treated as NOT the user's own: it is safer to keep
    // unverifiable rows out of "your analyses" than to present them as yours.
    const isUserAnalysis = Boolean(document) && document.is_demonstration === false
    return { ...analysis, document, is_user_analysis: isUserAnalysis }
  })
}

export function splitAnalyses(rows) {
  return {
    user: rows.filter((row) => row.is_user_analysis),
    demo: rows.filter((row) => !row.is_user_analysis),
  }
}
