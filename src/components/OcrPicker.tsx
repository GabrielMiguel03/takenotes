import { useState } from 'react'
import { FileImage, LoaderCircle, Upload } from 'lucide-react'
import { createWorker, PSM } from 'tesseract.js'

type Props = { onText: (text: string) => void }

async function prepareImage(file: File) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1800 / bitmap.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) return file
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < image.data.length; i += 4) {
    const gray = image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114
    const contrast = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 128))
    image.data[i] = contrast; image.data[i + 1] = contrast; image.data[i + 2] = contrast
  }
  context.putImageData(image, 0, 0)
  return await new Promise<Blob>((resolve) => canvas.toBlob(blob => resolve(blob ?? file), 'image/png', 1))
}

export function OcrPicker({ onText }: Props) {
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const handleFile = async (file?: File) => {
    if (!file) return
    setProcessing(true); setError('')
    try {
      const image = await prepareImage(file)
      const worker = await createWorker('por')
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1' })
      const result = await worker.recognize(image)
      await worker.terminate()
      onText(result.data.text)
    } catch {
      setError('Não foi possível ler esta imagem. Tente fotografar a nota inteira, com boa luz e sem inclinação.')
    } finally { setProcessing(false) }
  }
  return <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900"><span className="grid size-16 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-950/50">{processing ? <LoaderCircle className="animate-spin" size={28} /> : <FileImage size={28} />}</span><span className="mt-4 font-bold">{processing ? 'Lendo itens e preços...' : 'Selecionar foto da nota'}</span><span className="mt-2 max-w-sm text-xs leading-5 text-slate-500">Fotografe a nota inteira, de frente, com todos os produtos visíveis. A imagem é processada localmente.</span><span className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-slate-950"><Upload size={16} /> Escolher foto</span><input type="file" accept="image/*" capture="environment" className="hidden" disabled={processing} onChange={event => void handleFile(event.target.files?.[0])} />{error && <span className="mt-4 text-xs text-amber-600">{error}</span>}</label>
}
