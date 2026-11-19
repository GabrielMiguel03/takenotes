import { useRef, useState } from 'react'
import {
  Camera,
  CheckCircle2,
  FileImage,
  Images,
  LoaderCircle,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { createWorker, PSM } from 'tesseract.js'
import {
  mergeParsedReceipts,
  parseReceiptText,
  type ParsedReceipt,
} from '../services/nfceParser'

type Props = {
  onReceiptData?: (data: ParsedReceipt) => void
  onText?: (text: string) => void
}

type SelectedImage = {
  id: string
  file: File
  previewUrl: string
}

async function prepareImage(file: File): Promise<Blob> {
  try {
    let img: ImageBitmap | HTMLImageElement
    let width = 0
    let height = 0

    if (typeof createImageBitmap === 'function') {
      try {
        img = await createImageBitmap(file)
        width = img.width
        height = img.height
      } catch {
        img = await loadImage(file)
        width = img.naturalWidth
        height = img.naturalHeight
      }
    } else {
      img = await loadImage(file)
      width = img.naturalWidth
      height = img.naturalHeight
    }

    const scale = Math.min(1, 2200 / Math.max(width, 1))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    // Otimização de contraste e nitidez para leitura de texto
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const d = imageData.data
    for (let i = 0; i < d.length; i += 4) {
      const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
      const contrast = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128))
      d[i] = contrast
      d[i + 1] = contrast
      d[i + 2] = contrast
    }
    ctx.putImageData(imageData, 0, 0)

    return await new Promise<Blob>((resolve) =>
      canvas.toBlob((blob) => resolve(blob ?? file), 'image/png', 1),
    )
  } catch {
    return file
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}

export function OcrPicker({ onReceiptData, onText }: Props) {
  const [images, setImages] = useState<SelectedImage[]>([])
  const [processing, setProcessing] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [error, setError] = useState('')
  const [resultSummary, setResultSummary] = useState<string | null>(null)

  const galleryInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const addFiles = (files?: FileList | File[]) => {
    if (!files || files.length === 0) return
    setError('')
    setResultSummary(null)

    const next: SelectedImage[] = []
    const fileArray = Array.from(files)

    for (const f of fileArray) {
      if (!f.type.startsWith('image/')) continue
      next.push({
        id: crypto.randomUUID(),
        file: f,
        previewUrl: URL.createObjectURL(f),
      })
    }

    if (!next.length) return
    const updated = [...images, ...next]
    setImages(updated)

    // Inicia automaticamente o processamento se acabou de adicionar
    void processFiles(updated.map((item) => item.file))
  }

  const removeImage = (id: string) => {
    setImages((prev) => {
      const target = prev.find((img) => img.id === id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((img) => img.id !== id)
    })
    setResultSummary(null)
  }

  const processFiles = async (filesToProcess: File[]) => {
    if (!filesToProcess.length) return
    setProcessing(true)
    setError('')
    setResultSummary(null)

    try {
      setStatusText('Carregando mecanismo de leitura...')
      const worker = await createWorker('por')
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: '1',
      })

      const parsedList: ParsedReceipt[] = []
      const combinedTexts: string[] = []

      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i]
        const label = filesToProcess.length > 1 ? ` (${i + 1} de ${filesToProcess.length})` : ''
        setStatusText(`Lendo print / foto${label}...`)

        const preparedBlob = await prepareImage(file)
        const result = await worker.recognize(preparedBlob)
        const text = result.data.text
        combinedTexts.push(text)

        const parsed = parseReceiptText(text)
        parsedList.push(parsed)
      }

      await worker.terminate()

      setStatusText('Identificando cortes e removendo duplicatas...')
      const merged = mergeParsedReceipts(parsedList)

      if (onReceiptData) {
        onReceiptData(merged)
      } else if (onText) {
        onText(combinedTexts.join('\n\n'))
      }

      const count = merged.items.length
      const dupes = merged.duplicatesRemoved ?? 0
      const imgCount = filesToProcess.length

      let summary = ''
      if (count > 0) {
        if (imgCount > 1) {
          summary = `${count} item(ns) identificado(s) em ${imgCount} prints.`
          if (dupes > 0) {
            summary += ` ${dupes} item(ns) repetido(s) da sobreposição foram removidos automaticamente!`
          }
        } else {
          summary = `${count} item(ns) identificado(s). Revise abaixo antes de salvar.`
        }
      } else {
        summary = 'A foto foi lida, mas poucos produtos foram identificados. Complete ou revise nos campos abaixo.'
      }

      setResultSummary(summary)
    } catch {
      setError('Não foi possível ler as imagens. Tente selecionar fotos com boa luz e texto nítido.')
    } finally {
      setProcessing(false)
      setStatusText('')
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* ── Inputs ocultos ── */}
      {/* 1. Galeria / Prints (sem capture, com multiple) */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        disabled={processing}
        onChange={(e) => {
          addFiles(e.target.files ?? [])
          if (e.target) e.target.value = ''
        }}
      />

      {/* 2. Câmera direta (com capture="environment") */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={processing}
        onChange={(e) => {
          addFiles(e.target.files ?? [])
          if (e.target) e.target.value = ''
        }}
      />

      {/* ── Cabeçalho e Instruções ── */}
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/50">
          <FileImage size={22} />
        </div>
        <div>
          <h3 className="font-bold text-sm sm:text-base">Foto ou Prints da Nota</h3>
          <p className="text-xs text-slate-500">
            Você pode escolher prints da galeria (1 ou mais) ou fotografar a nota de papel.
          </p>
        </div>
      </div>

      {/* ── Botões de Escolha ── */}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={processing}
          onClick={() => galleryInputRef.current?.click()}
          className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-xs sm:text-sm font-bold text-slate-950 shadow-sm transition hover:bg-brand-400 disabled:opacity-50"
        >
          <Images size={18} />
          Escolher da Galeria / Prints
        </button>

        <button
          type="button"
          disabled={processing}
          onClick={() => cameraInputRef.current?.click()}
          className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-xs sm:text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          <Camera size={18} />
          Tirar foto com câmera
        </button>
      </div>

      <p className="mt-2 text-center text-[11px] text-slate-400">
        💡 Se a nota fiscal for longa, selecione <strong>2 ou mais prints</strong> da galeria. O app junta tudo e elimina produtos repetidos do corte!
      </p>

      {/* ── Miniaturas dos Prints Selecionados ── */}
      {images.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/50">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
            <span>{images.length} print(s) selecionado(s):</span>
            <button
              type="button"
              disabled={processing}
              onClick={() => galleryInputRef.current?.click()}
              className="inline-flex items-center gap-1 text-brand-600 hover:underline dark:text-brand-400"
            >
              <Plus size={14} /> Adicionar outro print
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {images.map((img, idx) => (
              <div
                key={img.id}
                className="group relative h-20 w-16 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <img
                  src={img.previewUrl}
                  alt={`Print ${idx + 1}`}
                  className="h-full w-full object-cover"
                />
                <span className="absolute bottom-0 inset-x-0 bg-slate-950/70 py-0.5 text-center text-[9px] font-bold text-white">
                  #{idx + 1}
                </span>
                {!processing && (
                  <button
                    type="button"
                    onClick={() => removeImage(img.id)}
                    className="absolute right-0.5 top-0.5 rounded-full bg-rose-600 p-1 text-white shadow hover:bg-rose-700"
                    aria-label="Remover imagem"
                  >
                    <Trash2 size={10} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Botão de reprocessar se o usuário quiser refazer */}
          {!processing && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => void processFiles(images.map((img) => img.file))}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <RefreshCw size={12} /> Reler prints
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Estado de Processamento ── */}
      {processing && (
        <div className="mt-4 flex flex-col items-center justify-center gap-2 rounded-xl bg-brand-50/60 p-4 text-center dark:bg-brand-950/20">
          <LoaderCircle className="animate-spin text-brand-600 dark:text-brand-400" size={24} />
          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{statusText}</p>
          <p className="text-[11px] text-slate-500">O OCR está sendo executado no seu próprio dispositivo.</p>
        </div>
      )}

      {/* ── Resumo de Sucesso com Deduplicação ── */}
      {resultSummary && !processing && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-brand-200 bg-brand-50 p-3 text-xs leading-5 text-brand-900 dark:border-brand-900/50 dark:bg-brand-950/30 dark:text-brand-300">
          <CheckCircle2 size={16} className="shrink-0 text-brand-600 dark:text-brand-400 mt-0.5" />
          <span>{resultSummary}</span>
        </div>
      )}

      {/* ── Mensagem de Erro ── */}
      {error && !processing && (
        <div className="mt-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      )}
    </div>
  )
}
