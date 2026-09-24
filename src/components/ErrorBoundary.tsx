import { Component, type ReactNode } from 'react'
import { isDbError, reloadOnce } from '../lib/health'

/** Replaces the blank screen React leaves after a render error with a way out. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(error)
    if (isDbError(error)) reloadOnce()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="page">
        <div className="panel">
          <h1>Algo ha fallado</h1>
          <p className="muted">Tus tarjetas están a salvo. Recarga la app para seguir.</p>
          <pre className="error-detail">{error.name}: {error.message}</pre>
          <div className="row">
            <button className="btn btn--primary" onClick={() => location.reload()}>Recargar</button>
            <a className="btn btn--ghost" href="#/" onClick={() => this.setState({ error: null })}>Ir a mazos</a>
          </div>
        </div>
      </div>
    )
  }
}
