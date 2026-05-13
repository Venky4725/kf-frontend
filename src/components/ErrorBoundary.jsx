import React from 'react'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({
      error,
      errorInfo
    })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Something went wrong</h1>
                <p className="text-sm text-slate-600 mt-1">The application encountered an unexpected error</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-4 mb-6 border border-slate-200">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">Error Details:</h2>
              <p className="text-sm text-rose-600 font-mono break-all">
                {this.state.error && this.state.error.toString()}
              </p>
              {this.state.errorInfo && (
                <details className="mt-3">
                  <summary className="text-xs text-slate-600 cursor-pointer hover:text-slate-900">
                    View stack trace
                  </summary>
                  <pre className="mt-2 text-xs text-slate-600 overflow-auto max-h-48 bg-white p-3 rounded border border-slate-200">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 text-white font-semibold rounded-lg transition-all duration-200 shadow-sm"
              >
                Reload Application
              </button>
              <button
                onClick={() => window.history.back()}
                className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-all duration-200"
              >
                Go Back
              </button>
            </div>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-800">
                <span className="font-semibold">💡 Tip:</span> If this error persists, try clearing your browser cache or contact support.
              </p>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
