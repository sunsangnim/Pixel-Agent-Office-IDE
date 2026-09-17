import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/** Without this, a single render-time exception anywhere in the tree (a bad
 *  prop, a null the code didn't expect) takes the whole window down to a
 *  blank white screen with no way back except relaunching the app. */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    window.api.system.logError('react-render', `${error.stack ?? error.message}\n${info.componentStack ?? ''}`)
  }

  private reload = (): void => window.location.reload()

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="error-boundary">
        <h1>문제가 발생했습니다</h1>
        <p>화면을 표시하는 중 오류가 발생했습니다. 진행 중이던 작업과 CLI 세션은 계속 실행되고 있을 수 있습니다.</p>
        <pre>{error.message}</pre>
        <button type="button" onClick={this.reload}>새로고침</button>
      </div>
    )
  }
}

export default ErrorBoundary
