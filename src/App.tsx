import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Home } from './pages/Home'
import { DeckPage } from './pages/DeckPage'
import { Study } from './pages/Study'
import { ImportPage } from './pages/ImportPage'
import { SettingsPage } from './pages/SettingsPage'
import { ErrorBoundary } from './components/ErrorBoundary'

function Shell() {
  const { pathname } = useLocation()
  const studying = pathname.startsWith('/study/')
  return (
    <div className={studying ? 'app app--focus' : 'app'}>
      {!studying && (
        <header className="topbar">
          <NavLink to="/" className="brand" end>
            <img src="/icon.svg" alt="" width={28} height={28} />
            Repaso
          </NavLink>
          <nav className="topnav">
            <NavLink to="/" end>Mazos</NavLink>
            <NavLink to="/import">Importar</NavLink>
            <NavLink to="/settings">Ajustes</NavLink>
          </nav>
        </header>
      )}
      <main className="main">
        <ErrorBoundary key={pathname}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/deck/:id" element={<DeckPage />} />
          <Route path="/study/:id" element={<Study />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
        </ErrorBoundary>
      </main>
    </div>
  )
}

export function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}
