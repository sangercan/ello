import { Component, type ErrorInfo, type ReactNode } from 'react'

interface RouteErrorBoundaryProps {
  children: ReactNode
}

interface RouteErrorBoundaryState {
  hasError: boolean
  message: string
}

class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = {
    hasError: false,
    message: '',
  }

  static getDerivedStateFromError(error: unknown): RouteErrorBoundaryState {
    const message = error instanceof Error ? error.message : 'Erro inesperado ao carregar esta tela.'
    return { hasError: true, message }
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error('[RouteErrorBoundary] Rendering error:', error, errorInfo)
  }

  private handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[50vh] flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950/80 p-5 text-center">
            <h2 className="text-white text-base font-semibold">Nao foi possivel carregar esta tela.</h2>
            <p className="text-slate-400 text-sm mt-2 break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-4 px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/85 transition"
            >
              Recarregar
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default RouteErrorBoundary
