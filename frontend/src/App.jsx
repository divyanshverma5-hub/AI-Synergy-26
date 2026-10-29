import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import Home from './pages/Home'
import Upload from './pages/Upload'
import PastAnalyses from './pages/PastAnalyses'
import AnalysisResults from './pages/AnalysisResults'
import DocumentDetail from './pages/DocumentDetail'
import BillHealth from './pages/BillHealth'
import ClauseExplorer from './pages/ClauseExplorer'
import Alerts from './pages/Alerts'
import ReviewCenter from './pages/ReviewCenter'
import Implications from './pages/Implications'
import ModelMetrics from './pages/ModelMetrics'
import AuditLog from './pages/AuditLog'
import NotFound from './pages/NotFound'

/**
 * Route table, kept separate from the entry point so tests can render it.
 *
 * The three primary destinations are Home, Analyse a Bill and Past Analyses.
 * Everything else is either a detail view reached from those (a single
 * analysis, a document) or a deeper tool reachable from the secondary menu.
 * `/upload` and `/dashboard` are kept as redirects so older links still work.
 */
export function AppRoutes() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/analyse" element={<Upload />} />
        <Route path="/analyses" element={<PastAnalyses />} />
        <Route path="/analyses/:id" element={<AnalysisResults />} />
        <Route path="/documents/:id" element={<DocumentDetail />} />

        {/* Deeper tools, reachable from the secondary "More tools" menu. */}
        <Route path="/health" element={<BillHealth />} />
        <Route path="/explorer" element={<ClauseExplorer />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/review" element={<ReviewCenter />} />
        <Route path="/implications" element={<Implications />} />
        <Route path="/metrics" element={<ModelMetrics />} />
        <Route path="/audit" element={<AuditLog />} />

        {/* Legacy paths kept working so existing links and bookmarks resolve. */}
        <Route path="/upload" element={<Navigate to="/analyse" replace />} />
        <Route path="/dashboard" element={<Navigate to="/analyses" replace />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  )
}
