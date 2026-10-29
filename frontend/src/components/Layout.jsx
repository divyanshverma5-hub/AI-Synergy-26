import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { DISCLAIMER } from '../constants'

/** Primary navigation: the whole upload-to-review journey in three entries. */
const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/analyse', label: 'Analyse a Bill' },
  { to: '/analyses', label: 'Past Analyses' },
]

/**
 * Secondary menu. These pages are all still fully working, but they are tools
 * for looking deeper into one analysis rather than top-level destinations, so
 * they sit behind "More tools" instead of crowding the main navigation.
 */
const TOOLS = [
  { to: '/explorer', label: 'Clause explorer' },
  { to: '/health', label: 'Bill health' },
  { to: '/alerts', label: 'Safeguard & rights alerts' },
  { to: '/review', label: 'Human review' },
  { to: '/implications', label: 'Implications' },
  { to: '/metrics', label: 'Model metrics' },
  { to: '/audit', label: 'Audit log' },
]

export function Layout({ children }) {
  const [toolsOpen, setToolsOpen] = useState(false)
  const location = useLocation()
  const toolsRef = useRef(null)

  // Close the secondary menu on navigation and on an outside click or Escape,
  // so it can never trap the user behind an invisible overlay.
  useEffect(() => {
    setToolsOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!toolsOpen) return undefined
    const onPointerDown = (event) => {
      if (toolsRef.current && !toolsRef.current.contains(event.target)) setToolsOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setToolsOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [toolsOpen])

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
            <div className="tools" ref={toolsRef}>
              <button
                type="button"
                className={`nav-toggle${toolsOpen ? ' open' : ''}`}
                aria-expanded={toolsOpen}
                aria-haspopup="true"
                onClick={() => setToolsOpen((open) => !open)}
              >
                More tools
                <span aria-hidden="true">{toolsOpen ? '▴' : '▾'}</span>
              </button>
              {toolsOpen ? (
                <div className="tools-menu" role="menu" aria-label="More tools">
                  {TOOLS.map((tool) => (
                    <Link key={tool.to} to={tool.to} role="menuitem">
                      {tool.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
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
