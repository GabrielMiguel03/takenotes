import { useEffect, useRef, useState } from 'react'
import { Camera, FileText, LoaderCircle, Pencil } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import { fetchNfceData } from '../services/nfceClient'
import type { ParsedReceipt } from '../services/nfceParser'

type Props = { onDecoded: (value: string) => void; onReceiptData?: (data: ParsedReceipt) => void }
const fallback = (mode: 'manual' | 'ocr') => window.dispatchEvent(new CustomEvent('takenotes:scan-fallback', { detail: mode }))

export function QrScanner({ onDecoded, onReceiptData }: Props) {
  const scanner = useRef<Html5Qrcode | null>(null)
  const [message, setMessage] = useState('')
  const [starting, setStarting] = useState(true)
  const [lookup, setLookup] = useState<{ storeName?: string; total?: number } | null>(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [decoded, setDecoded] = useState('')

  useEffect(() => {
    const instance = new Html5Qrcode('notacontrol-qr-reader'); scanner.current = instance
    void instance.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 }, value => {
      if (decoded) return
      setDecoded(value); onDecoded(value); void instance.stop().catch(() => undefined); setLookingUp(true); setMessage('QR Code lido. Tentando consultar a NFC-e sem sair desta tela...')
      void fetchNfceData(value).then(data => { setLookup(data); onReceiptData?.(data); setMessage(data.items.length ? 'Dados encontrados. Revise os campos e os itens antes de salvar.' : 'A página respondeu, mas não trouxe itens reconhecíveis. Você pode completar manualmente ou usar uma foto.') }).catch(() => setMessage('A SEFAZ não respondeu. O QR Code foi mantido e você pode continuar manualmente ou usar uma foto/OCR.')).finally(() => setLookingUp(false))
    }, () => undefined).then(() => setStarting(false)).catch(() => { setStarting(false); setMessage('Não foi possível acessar a câmera. Use uma foto da nota ou preencha os dados manualmente.') })
    return () => { if (instance.isScanning) void instance.stop().catch(() => undefined) }
  }, [])

  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 dark:border-slate-700"><div id="notacontrol-qr-reader" className="min-h-64" />{starting && <div className="flex items-center justify-center gap-2 p-4 text-sm text-slate-300"><LoaderCircle className="animate-spin" size={17} /> Abrindo câmera...</div>}{!starting && !decoded && !message && <p className="flex items-center justify-center gap-2 p-4 text-xs text-slate-300"><Camera size={15} /> Aponte a câmera para o QR Code da NFC-e</p>}{lookingUp && <p className="flex items-center justify-center gap-2 p-4 text-xs text-slate-300"><LoaderCircle className="animate-spin" size={15} /> Consultando sem fechar o cadastro...</p>}{lookup && <div className="border-t border-slate-700 p-4 text-sm text-slate-200"><p className="font-semibold">{lookup.storeName ?? 'NFC-e identificada'}</p>{lookup.total !== undefined && <p className="mt-1 text-brand-300">Total encontrado: {lookup.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>}</div>}{message && <div className="border-t border-slate-700 p-4"><p className="text-center text-xs leading-5 text-amber-200">{message}</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><button onClick={() => fallback('manual')} className="flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-900"><Pencil size={15} /> Continuar manualmente</button><button onClick={() => fallback('ocr')} className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-3 py-2 text-xs font-bold text-slate-950"><FileText size={15} /> Usar foto/OCR</button></div></div>}</div>
}
