import { useEffect, useRef, useState } from 'react'
import {
  Camera,
  CheckCircle2,
  ClipboardPaste,
  ExternalLink,
  FileText,
  Images,
  LoaderCircle,
  Pencil,
  X,
} from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import { fetchNfceData } from '../services/nfceClient'
import { parseReceiptText, type ParsedReceipt } from '../services/nfceParser'

type Props = { onDecoded: (value: string) => void; onReceiptData?: (data: ParsedReceipt) => void }
type Stage = 'scanning' | 'looking' | 'success' | 'blocked' | 'paste'

const triggerOcr = () =>
  window.dispatchEvent(new CustomEvent('takenotes:scan-fallback', { detail: 'ocr' }))
const triggerManual = () =>
  window.dispatchEvent(new CustomEvent('takenotes:scan-fallback', { detail: 'manual' }))

export function QrScanner({ onDecoded, onReceiptData }: Props) {
  const scanner = useRef<Html5Qrcode | null>(null)
  const [stage, setStage] = useState<Stage>('scanning')
  const [starting, setStarting] = useState(true)
  const [nfceUrl, setNfceUrl] = useState('')
  const [lookup, setLookup] = useState<{ storeName?: string; total?: number } | null>(null)
  const [urlOpened, setUrlOpened] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteError, setPasteError] = useState('')
  const pasteRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const instance = new Html5Qrcode('notacontrol-qr-reader')
    scanner.current = instance

    void instance
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
        (value) => {
          if (stage !== 'scanning') return
          setNfceUrl(value)
          onDecoded(value)
          void instance.stop().catch(() => undefined)
          setStage('looking')

          void fetchNfceData(value)
            .then((data) => {
              setLookup(data)
              onReceiptData?.(data)
              setStage(data.items.length ? 'success' : 'blocked')
            })
            .catch(() => setStage('blocked'))
        },
        () => undefined,
      )
      .then(() => setStarting(false))
      .catch(() => {
        setStarting(false)
        // falha de câmera — trata como erro de acesso
        setStage('blocked')
      })

    return () => {
      if (instance.isScanning) void instance.stop().catch(() => undefined)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (stage === 'paste') setTimeout(() => pasteRef.current?.focus(), 100)
  }, [stage])

  /* Abre a URL no navegador do sistema */
  const openUrl = () => {
    if (!nfceUrl) return
    window.open(nfceUrl, '_blank', 'noopener')
    setUrlOpened(true)
  }

  /* Fluxo primário para leigos: abre URL + vai direto ao OCR */
  const openAndScanPrint = () => {
    openUrl()
    // Pequeno delay para o navegador abrir antes de trocar de tela
    setTimeout(() => triggerOcr(), 400)
  }

  /* Fluxo avançado: colar texto (desktop / usuários experientes) */
  const goToPaste = async () => {
    setStage('paste')
    try {
      const text = await navigator.clipboard.readText()
      if (text.length > 10) setPasteText(text)
    } catch {
      /* sem permissão — usuário vai colar manualmente */
    }
  }

  const handlePasteSubmit = () => {
    const text = pasteText.trim()
    if (text.length < 10) {
      setPasteError('Cole o texto copiado da página da SEFAZ antes de continuar.')
      return
    }
    setPasteError('')
    const data = parseReceiptText(text)
    if (!data.items.length && !data.storeName && !data.total) {
      setPasteError(
        'Não foi possível identificar itens no texto colado. Certifique-se de copiar a página inteira da nota fiscal.',
      )
      return
    }
    onReceiptData?.(data)
    setLookup(data)
    setStage('success')
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 dark:border-slate-700">

      {/* ── CÂMERA ──────────────────────────────────────────────────────── */}
      <div id="notacontrol-qr-reader" className={stage !== 'scanning' ? 'hidden' : 'min-h-64'} />

      {stage === 'scanning' && starting && (
        <div className="flex items-center justify-center gap-2 p-6 text-sm text-slate-300">
          <LoaderCircle className="animate-spin" size={17} /> Abrindo câmera...
        </div>
      )}
      {stage === 'scanning' && !starting && (
        <p className="flex items-center justify-center gap-2 p-4 text-xs text-slate-300">
          <Camera size={15} /> Aponte a câmera para o QR Code da NFC-e
        </p>
      )}

      {/* ── CONSULTANDO ─────────────────────────────────────────────────── */}
      {stage === 'looking' && (
        <div className="flex flex-col items-center gap-3 p-8 text-slate-300">
          <LoaderCircle className="animate-spin" size={28} />
          <p className="text-center text-sm">QR Code lido. Consultando a NFC-e…</p>
          <p className="text-center text-xs text-slate-500">Você não sairá desta tela.</p>
        </div>
      )}

      {/* ── SUCESSO ─────────────────────────────────────────────────────── */}
      {stage === 'success' && lookup && (
        <div className="p-5 text-slate-200">
          <div className="flex items-center gap-2 text-brand-400">
            <CheckCircle2 size={18} />
            <span className="font-semibold text-sm">Dados encontrados automaticamente</span>
          </div>
          {lookup.storeName && <p className="mt-2 text-sm">{lookup.storeName}</p>}
          {lookup.total !== undefined && (
            <p className="text-sm text-brand-300">
              Total: {lookup.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          )}
          <p className="mt-3 text-xs text-slate-400">Revise os campos e os itens abaixo antes de salvar.</p>
        </div>
      )}

      {/* ── BLOQUEADO PELA SEFAZ ────────────────────────────────────────── */}
      {stage === 'blocked' && (
        <div className="p-5">
          <p className="text-sm font-semibold text-amber-300">
            A SEFAZ bloqueou a consulta automática
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            O portal exige que você acesse pelo navegador. Veja as opções abaixo — a mais fácil é a primeira.
          </p>

          <div className="mt-4 space-y-3">

            {/* ── OPÇÃO 1: a mais fácil para leigos ── */}
            <div className="rounded-xl border border-brand-500/40 bg-brand-500/10 p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-400">
                ✦ Mais fácil — recomendado
              </p>
              <ol className="mb-3 space-y-1 text-xs leading-5 text-slate-300">
                <li>
                  <span className="font-bold text-brand-400">1.</span>{' '}
                  Toque em <strong>"Abrir nota"</strong> — a nota abre no navegador.
                </li>
                <li>
                  <span className="font-bold text-brand-400">2.</span>{' '}
                  Resolva o CAPTCHA se aparecer e aguarde carregar.
                </li>
                <li>
                  <span className="font-bold text-brand-400">3.</span>{' '}
                  <strong>Tire um ou mais prints</strong> da nota (se for longa, role a tela e tire mais prints).
                </li>
                <li>
                  <span className="font-bold text-brand-400">4.</span>{' '}
                  Volte aqui e toque em <strong>"Selecionar prints"</strong>. O app junta tudo e elimina itens repetidos!
                </li>
              </ol>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={openUrl}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-brand-500 px-3 py-2.5 text-xs font-bold text-brand-400"
                >
                  <ExternalLink size={14} />
                  {urlOpened ? 'Reabrir nota' : 'Abrir nota'}
                </button>
                <button
                  onClick={triggerOcr}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-500 px-3 py-2.5 text-xs font-bold text-slate-950"
                >
                  <Images size={14} /> Selecionar prints
                </button>
              </div>
              {/* Atalho: abre URL + muda para OCR de uma vez */}
              {!urlOpened && (
                <button
                  onClick={openAndScanPrint}
                  className="mt-2 w-full rounded-xl bg-brand-500/20 px-3 py-2 text-xs font-semibold text-brand-300 hover:bg-brand-500/30"
                >
                  Fazer tudo automaticamente →
                </button>
              )}
            </div>

            {/* ── OPÇÃO 2: foto da nota física ── */}
            <button
              onClick={triggerOcr}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-700 px-4 py-3 text-left"
            >
              <FileText size={18} className="shrink-0 text-slate-400" />
              <div>
                <p className="text-xs font-semibold text-slate-200">Foto da nota em papel</p>
                <p className="text-[11px] text-slate-500">Fotografe a nota impressa diretamente</p>
              </div>
            </button>

            {/* ── OPÇÃO 3: digitar manualmente ── */}
            <button
              onClick={triggerManual}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-700 px-4 py-3 text-left"
            >
              <Pencil size={18} className="shrink-0 text-slate-400" />
              <div>
                <p className="text-xs font-semibold text-slate-200">Preencher manualmente</p>
                <p className="text-[11px] text-slate-500">Digite o valor e os itens você mesmo</p>
              </div>
            </button>

            {/* ── OPÇÃO 4: colar texto (avançado) ── */}
            <button
              onClick={() => void goToPaste()}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-700/50 px-4 py-2.5 text-left opacity-70 hover:opacity-100"
            >
              <ClipboardPaste size={16} className="shrink-0 text-slate-500" />
              <div>
                <p className="text-[11px] font-semibold text-slate-400">Colar texto da página (avançado)</p>
                <p className="text-[10px] text-slate-600">Ctrl+A → Ctrl+C na página e cole aqui</p>
              </div>
            </button>

          </div>
        </div>
      )}

      {/* ── MODO PASTE (avançado) ───────────────────────────────────────── */}
      {stage === 'paste' && (
        <div className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-200">Colar texto da NFC-e</p>
            <button
              onClick={() => setStage('blocked')}
              className="text-slate-400 hover:text-slate-200"
              aria-label="Voltar"
            >
              <X size={18} />
            </button>
          </div>
          <ol className="mb-3 space-y-1 text-xs leading-5 text-slate-300">
            <li><span className="font-bold text-brand-400">1.</span> Abra a nota no navegador e resolva o CAPTCHA.</li>
            <li><span className="font-bold text-brand-400">2.</span> Selecione tudo: <code className="rounded bg-slate-800 px-1">Ctrl+A</code></li>
            <li><span className="font-bold text-brand-400">3.</span> Copie: <code className="rounded bg-slate-800 px-1">Ctrl+C</code></li>
            <li><span className="font-bold text-brand-400">4.</span> Cole abaixo e clique em Processar.</li>
          </ol>
          <textarea
            ref={pasteRef}
            value={pasteText}
            onChange={(e) => { setPasteText(e.target.value); setPasteError('') }}
            placeholder="Cole aqui o texto copiado da página da SEFAZ…"
            rows={5}
            className="w-full resize-none rounded-xl border border-slate-600 bg-slate-800 p-3 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
          {pasteError && <p className="mt-1.5 text-xs text-rose-400">{pasteError}</p>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={openUrl}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200"
            >
              <ExternalLink size={14} /> {urlOpened ? 'Reabrir' : 'Abrir nota'}
            </button>
            <button
              onClick={handlePasteSubmit}
              disabled={!pasteText.trim()}
              className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"
            >
              <ClipboardPaste size={14} /> Processar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
