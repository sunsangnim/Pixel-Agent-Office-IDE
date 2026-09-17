import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import SettingsWindow from './SettingsWindow'
import './styles/global.css'
import { resetChatForBoot } from './lib/chatHistory'

const isSettingsView = new URLSearchParams(window.location.search).get('view') === 'settings'

async function start(): Promise<void> {
  if (!isSettingsView && window.api.system.getBootId) resetChatForBoot(localStorage, await window.api.system.getBootId())
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>{isSettingsView ? <SettingsWindow /> : <App />}</React.StrictMode>
  )
}
void start().catch(error => { document.getElementById('root')!.textContent = `IDE 초기화 실패: ${String(error)}` })
