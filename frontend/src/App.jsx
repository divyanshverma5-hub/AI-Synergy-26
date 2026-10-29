import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import Dashboard from './pages/Dashboard'
import Upload from './pages/Upload'
import DocumentDetail from './pages/DocumentDetail'
import AnalysisDetail from './pages/AnalysisDetail'
import BillHealth from './pages/BillHealth'
import ClauseExplorer from './pages/ClauseExplorer'
import Alerts from './pages/Alerts'
import ReviewCenter from './pages/ReviewCenter'
import Implications from './pages/Implications'
import ModelMetrics from './pages/ModelMetrics'
import AuditLog from './pages/AuditLog'
import NotFound from './pages/NotFound'

/** Route table, kept separate from the entry point so tests can render it. */
export function AppRoutes() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/documents/:id" element={<DocumentDetail />} />
        <Route path="/analyses/:id" element={<AnalysisDetail />} />
        <Route path="/health" element={<BillHealth />} />
        <Route path="/explorer" element={<ClauseExplorer />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/review" element={<ReviewCenter />} />
        <Route path="/implications" element={<Implications />} />
        <Route path="/metrics" element={<ModelMetrics />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  )
}
