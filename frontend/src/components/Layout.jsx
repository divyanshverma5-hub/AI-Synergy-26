import { Link, NavLink } from 'react-router-dom'
import { DISCLAIMER } from '../constants'

const LINKS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/upload', label: 'Upload & analyse' },
  { to: '/health', label: 'Bill health' },
  { to: '/explorer', label: 'Clause explorer' },
  { to: '/alerts', label: 'Safeguard & rights alerts' },
  { to: '/review', label: 'Human review' },
  { to: '/implications', label: 'Implications' },
  { to: '/metrics', label: 'Model metrics' },
  { to: '/audit', label: 'Audit log' },
]

export function Layout({ children }) {
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            Rights Regression Radar
            <span>Decision support for proposed Indian legislation</span>
          </Link>
          <nav className="nav" aria-label="Main">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="page">{children}</main>
      <footer className="footer">
        <div className="footer-inner">{DISCLAIMER}</div>
      </footer>
    </div>
  )
}

export function PageHeader({ title, children }) {
  return (
    <div className="page-header">
      <h1>{title}</h1>
      {children}
    </div>
  )
}
