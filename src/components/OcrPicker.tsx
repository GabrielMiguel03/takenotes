import { useState } from 'react'
import { LoaderCircle, Upload } from 'lucide-react'
import { createWorker } from 'tesseract.js'

type Props = { onText: (text: string) => void }

export function OcrPicker({ onText }: Props) {
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const handleFile = async (file?: File) => {
    if (!file) return
    setProcessing(true); setError('')
    try {
      const worker = await createWorker('por')
      const result = await worker.recognize(file)
      await worker.terminate()
      onText(result.data.text)
    } catch {
      setError('Não foi possível ler esta imagem. Você pode continuar preenchendo manualmente.')
    } finally { setProcessing(false) }
  }
  return <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900"><span className="grid size-16 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-950/50">{processing ? <LoaderCircle className="animate-spin" size={28} /> : <Upload size={28} />}</span><span className="mt-4 font-bold">{processing ? 'Lendo nota...' : 'Selecionar foto da nota'}</span><span className="mt-2 text-xs text-slate-500">O processamento é local e não envia sua imagem.</span><input type="file" accept="image/*" capture="environment" className="hidden" disabled={processing} onChange={event => void handleFile(event.target.files?.[0])} />{error && <span className="mt-4 text-xs text-amber-600">{error}</span>}</label>
}
