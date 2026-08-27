import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import SettingsWindow from './SettingsWindow'
import './styles/global.css'

const isSettingsView = new URLSearchParams(window.location.search).get('view') === 'settings'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{isSettingsView ? <SettingsWindow /> : <App />}</React.StrictMode>
)
