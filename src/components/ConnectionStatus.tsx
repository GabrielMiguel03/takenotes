import { useEffect, useState, type ReactNode } from 'react'

export function ConnectionStatus({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [showRestored, setShowRestored] = useState(false)

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true)
      setShowRestored(true)
      window.setTimeout(() => setShowRestored(false), 2600)
    }
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return <>
    {children}
    {!online && <div className="fixed inset-x-3 bottom-20 z-[60] rounded-xl bg-amber-500 px-4 py-3 text-center text-xs font-semibold text-amber-950 shadow-lg lg:bottom-4">Modo offline: seus dados continuam disponíveis neste dispositivo.</div>}
    {online && showRestored && <div className="fixed inset-x-3 bottom-20 z-[60] rounded-xl bg-emerald-500 px-4 py-3 text-center text-xs font-semibold text-emerald-950 shadow-lg lg:bottom-4">Conexão restaurada.</div>}
  </>
}
