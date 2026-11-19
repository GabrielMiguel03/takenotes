import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './AppV2'
import './index.css'
import { seedDatabase } from './db'
import { ConnectionStatus } from './components/ConnectionStatus'
import { AuthGate } from './components/AuthGate'

registerSW({ immediate: true })

void seedDatabase().catch((error) => {
  console.error('Não foi possível inicializar o banco local:', error)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConnectionStatus><AuthGate><App /></AuthGate></ConnectionStatus>
  </StrictMode>,
)
