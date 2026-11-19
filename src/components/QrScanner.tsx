import { useEffect, useRef, useState } from 'react'
import { Camera, LoaderCircle } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import { fetchNfceData } from '../services/nfceClient'
import type { ParsedReceipt } from '../services/nfceParser'

type Props = { onDecoded: (value: string) => void; onReceiptData?: (data: ParsedReceipt) => void }

function fillInput(placeholder: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`)
  if (!input) return
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

export function QrScanner({ onDecoded, onReceiptData }: Props) {
  const scanner = useRef<Html5Qrcode | null>(null)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(true)
  const [lookup, setLookup] = useState<{ storeName?: string; total?: number } | null>(null)
  const [lookingUp, setLookingUp] = useState(false)

  useEffect(() => {
    const instance = new Html5Qrcode('notacontrol-qr-reader')
    scanner.current = instance
    void instance.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
      (value) => {
        onDecoded(value)
        void instance.stop()
        setLookingUp(true)
        void fetchNfceData(value)
          .then((data) => {
            setLookup(data)
            onReceiptData?.(data)
            if (data.storeName) fillInput('Nome da loja', data.storeName)
            if (data.total !== undefined) fillInput('0,00', data.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }))
            if (data.items[0]) fillInput('Produto', data.items[0].name)
          })
          .catch(() => setError('QR Code lido, mas a consulta da NFC-e não respondeu. Confira os dados no modo manual.'))
          .finally(() => setLookingUp(false))
      },
      () => undefined,
    ).then(() => setStarting(false)).catch(() => {
      setStarting(false)
      setError('Não foi possível acessar a câmera. Confira a permissão do navegador ou use o modo manual.')
    })
    return () => { if (instance.isScanning) void instance.stop().catch(() => undefined) }
  }, [onDecoded])

  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 dark:border-slate-700">
    <div id="notacontrol-qr-reader" className="min-h-64" />
    {starting && <div className="flex items-center justify-center gap-2 p-4 text-sm text-slate-300"><LoaderCircle className="animate-spin" size={17} /> Abrindo câmera...</div>}
    {!starting && !error && !lookup && <p className="flex items-center justify-center gap-2 p-4 text-xs text-slate-300"><Camera size={15} /> Aponte a câmera para o QR Code da NFC-e</p>}
    {lookingUp && <p className="flex items-center justify-center gap-2 p-4 text-xs text-slate-300"><LoaderCircle className="animate-spin" size={15} /> Consultando dados da NFC-e...</p>}
    {lookup && <div className="border-t border-slate-700 p-4 text-sm text-slate-200"><p className="font-semibold">{lookup.storeName ?? 'NFC-e identificada'}</p>{lookup.total !== undefined && <p className="mt-1 text-brand-300">Total encontrado: {lookup.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>}</div>}
    {error && <p className="p-4 text-center text-xs text-amber-300">{error}</p>}
  </div>
}
