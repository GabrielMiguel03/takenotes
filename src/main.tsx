import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'
import { seedDatabase } from './db'
import { ConnectionStatus } from './components/ConnectionStatus'

registerSW({ immediate: true })

void seedDatabase().catch((error) => {
  console.error('Não foi possível inicializar o banco local:', error)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConnectionStatus><App /></ConnectionStatus>
  </StrictMode>,
)
