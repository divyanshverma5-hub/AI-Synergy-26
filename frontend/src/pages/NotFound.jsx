import { Link } from 'react-router-dom'
import { PageHeader } from '../components/Layout'

export default function NotFound() {
  return (
    <>
      <PageHeader title="Page not found">
        <p>The page you asked for does not exist in this application.</p>
      </PageHeader>
      <div className="card">
        <p>
          <Link to="/">Return to the dashboard</Link> or pick a section from the navigation above.
        </p>
      </div>
    </>
  )
}
