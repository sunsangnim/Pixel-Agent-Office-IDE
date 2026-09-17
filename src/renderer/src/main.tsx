import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import SettingsWindow from './SettingsWindow'
import ErrorBoundary from './components/ErrorBoundary'
import './styles/global.css'
import { resetChatForBoot } from './lib/chatHistory'

const isSettingsView = new URLSearchParams(window.location.search).get('view') === 'settings'

// Catches what an Error Boundary can't: exceptions outside React's render
// (event handlers, timers) and rejected promises nobody awaited.
window.addEventListener('error', (event) => {
  window.api.system.logError('window-error', event.error?.stack ?? event.message)
})
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  window.api.system.logError('unhandled-rejection', reason instanceof Error ? reason.stack ?? reason.message : String(reason))
})

async function start(): Promise<void> {
  if (!isSettingsView && window.api.system.getBootId) resetChatForBoot(localStorage, await window.api.system.getBootId())
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <ErrorBoundary>{isSettingsView ? <SettingsWindow /> : <App />}</ErrorBoundary>
    </React.StrictMode>
  )
}
void start().catch(error => { document.getElementById('root')!.textContent = `IDE 초기화 실패: ${String(error)}` })
