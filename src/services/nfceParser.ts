export type NfceResult = { url: string; accessKey?: string; storeName?: string; text?: string }
export type ParsedReceipt = {
  total?: number
  storeName?: string
  cnpj?: string
  lines: string[]
  items: Array<{ name: string; totalPrice?: number; quantity?: number; unitPrice?: number }>
}

// ─── Utilitários monetários ───────────────────────────────────────────────────

function parseBRL(value: string): number {
  // aceita "1.234,56" e "1234.56" e "1234,56"
  const v = value.replace(/R\$\s*/i, '').trim()
  if (v.includes(',')) return parseFloat(v.replace(/\./g, '').replace(',', '.'))
  return parseFloat(v)
}

function moneyRe() { return /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/gi }

function firstMoney(str: string): number | undefined {
  const match = str.match(/(?:R\$\s*)(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/)
  if (match) return parseBRL(match[1])
  return undefined
}

function lastMoney(str: string): number | undefined {
  const all = [...str.matchAll(moneyRe())]
  if (!all.length) return undefined
  return parseBRL(all[all.length - 1][1])
}

// ─── Limpeza de nome de produto ───────────────────────────────────────────────

function cleanProductName(raw: string): string {
  return raw
    .replace(/^[^A-Za-zÀ-ÿ0-9]+/, '')          // remove lixo no início
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*\b\d+\s*(?:UN|KG|GR?|ML|LT?)\b\s*$/i, '')  // remove unidades no fim
    .replace(/\s*x\s*\d+([.,]\d+)?\s*$/i, '')   // remove "x2" no fim
    .trim()
}

// ─── Palavras-chave de exclusão de linha ──────────────────────────────────────

const SKIP_LINE_RE = /\b(total|troco|desconto|pagamento|subtotal|cnpj|cpf|documento|chave|cupom|nota fiscal|forma de|endere[cç]|fone|tel\b|sit\.|data\s+emiss|n[uú]mero|insc|iest|uf\b|cod\.?\s*bar|via\s+do|contribui|tributad|cst\b|icms|ipi\b|cfop|ncm\b|un\s+med|vl\s+unit|qtd?\.?\s*\d|qt\b|sat|ecf\b|dv\b)\b/i

// ─── Parser principal de HTML SEFAZ (tenta estrutura DOM antes de texto puro) ─

function parseNfceHtml(html: string): ParsedReceipt {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  // 1) Nome da loja — tenta elementos típicos
  const storeSelectors = [
    '#txtNomeEmit', '#nomeEmitente', '.txtTopo', '.x-emitente',
    '[class*="emit"]', '[id*="emit"]', '[class*="empresa"]',
  ]
  let storeName: string | undefined
  for (const sel of storeSelectors) {
    const text = doc.querySelector(sel)?.textContent?.trim()
    if (text && text.length > 2 && text.length < 100) { storeName = text; break }
  }

  // 2) CNPJ
  const cnpjMatch = doc.body.textContent?.match(/\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/)
  const cnpj = cnpjMatch?.[0]

  // 3) Total — tenta elemento típico antes de regex
  const totalSelectors = [
    '#totais', '#vlrTotalNota', '#total', '#totalNF', '#vlTotal',
    '[id*="total"]', '[class*="total"]',
  ]
  let total: number | undefined
  for (const sel of totalSelectors) {
    const text = doc.querySelector(sel)?.textContent
    if (text) { const v = firstMoney(text); if (v && v > 0) { total = v; break } }
  }

  // 4) Itens — estratégia 1: tabela de produtos (linhas <tr>)
  const items: ParsedReceipt['items'] = []
  const tableRows = doc.querySelectorAll('table tr')

  if (tableRows.length > 1) {
    // descobre header para saber quais colunas são nome, qtd, unit, total
    const headerRow = tableRows[0]
    const headers = [...headerRow.querySelectorAll('th,td')].map(td => td.textContent?.toLowerCase().trim() ?? '')

    const colName = headers.findIndex(h => /descri|produto|item|nome/i.test(h))
    const colQty  = headers.findIndex(h => /qtd|qt\b|quant/i.test(h))
    const colUnit = headers.findIndex(h => /unit|vl\s*un|pr\s*un/i.test(h))
    const colTot  = headers.findIndex(h => /total|vl\s*tot|subtot/i.test(h))

    for (let i = 1; i < tableRows.length; i++) {
      const cells = [...tableRows[i].querySelectorAll('td')]
      if (cells.length < 2) continue
      const rawName = cells[colName >= 0 ? colName : 0]?.textContent?.trim() ?? ''
      const name = cleanProductName(rawName)
      if (name.length < 2) continue
      const quantity  = colQty  >= 0 ? parseBRL(cells[colQty]?.textContent?.replace(',', '.') ?? '1') || 1 : undefined
      const unitPrice = colUnit >= 0 ? firstMoney(cells[colUnit]?.textContent ?? '') : undefined
      const totalPrice = colTot >= 0
        ? firstMoney(cells[colTot]?.textContent ?? '')
        : (unitPrice && quantity ? unitPrice * quantity : undefined)
      items.push({ name, quantity, unitPrice, totalPrice })
    }
  }

  // Estratégia 2: divs/spans com classe típica de item (SEFAZ SP, MG, RS, etc.)
  if (!items.length) {
    // selectors para container de cada produto
    const prodContainers = doc.querySelectorAll(
      '[class*="item"], [class*="prod"], [id*="prod"], [class*="Prod"], [id*="item"]'
    )
    prodContainers.forEach(container => {
      const text = container.textContent?.trim() ?? ''
      if (!text || text.length < 3) return
      const totalPrice = lastMoney(text)
      if (!totalPrice) return
      // primeiro pedaço antes de qualquer número é o nome
      const rawName = text.split(/\d/)[0].trim()
      const name = cleanProductName(rawName)
      if (name.length >= 2) items.push({ name, totalPrice })
    })
  }

  // Estratégia 3: fallback — parsear o texto puro
  if (!items.length) {
    return { ...parseReceiptText(doc.body.textContent ?? ''), storeName: storeName ?? undefined, cnpj: cnpj ?? undefined, total: total }
  }

  // Remove duplicatas
  const unique = dedupe(items)

  // Se total ainda não encontrado, soma dos itens
  if (!total && unique.length) {
    const sum = unique.reduce((acc, i) => acc + (i.totalPrice ?? 0), 0)
    if (sum > 0) total = parseFloat(sum.toFixed(2))
  }

  const lines = (doc.body.textContent ?? '').split('\n').map(l => l.trim()).filter(Boolean)
  return { total, storeName, cnpj, lines, items: unique }
}

// ─── Remove itens duplicados ──────────────────────────────────────────────────

function dedupe<T extends { name: string; totalPrice?: number }>(items: T[]): T[] {
  return items.filter((item, index, all) =>
    all.findIndex(
      other => other.name.toLowerCase() === item.name.toLowerCase() && other.totalPrice === item.totalPrice,
    ) === index,
  )
}

// ─── Parser de texto puro (OCR ou fallback) ───────────────────────────────────

export function parseReceiptText(text: string): ParsedReceipt {
  const normalized = text.replace(/[|]/g, ' ').replace(/\r/g, '')
  const lines = normalized.split('\n').map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean)

  // Total
  const totalMatch = normalized.match(
    /(?:TOTAL(?:\s+A\s+PAGAR)?|VALOR\s+A\s+PAGAR|VALOR\s+TOTAL)[^\d]*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[,.]?\d{2})/i,
  )
  const total = totalMatch ? parseBRL(totalMatch[1]) : undefined

  // CNPJ
  const cnpj = normalized.match(/\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/)?.[0]

  // Nome da loja — primeira linha com texto que não seja keywords
  const storeName = lines.find(
    line => line.length > 3 && !/cnpj|cpf|documento|consumidor|chave|total|cupom|nota fiscal|endere[cç]|sit\.|data/i.test(line),
  )

  // Itens
  const items = lines.map(line => {
    if (SKIP_LINE_RE.test(line)) return undefined
    const all = [...line.matchAll(moneyRe())]
    if (!all.length) return undefined
    const last = all[all.length - 1]
    const price = last[0]
    const before = line.slice(0, last.index ?? line.length)
    // Remove código de barras, quantidades e unidades antes do nome
    const name = cleanProductName(
      before
        .replace(/^\d{3,}\s*/, '')
        .replace(/\b\d+\s*(?:UN|KG|GR?|ML|LT?)\b/gi, '')
        .replace(/\b\d+([,.]?\d+)?\s*x\s*/gi, ''),
    )
    if (name.length < 2 || /^\d+$/.test(name)) return undefined
    const totalPrice = parseBRL(price)
    if (!isFinite(totalPrice) || totalPrice <= 0) return undefined
    return { name, totalPrice }
  }).filter((item): item is { name: string; totalPrice: number } => Boolean(item))

  return { total, storeName, cnpj, lines, items: dedupe(items) }
}

// ─── Extrai informações básicas do URL do QR Code ────────────────────────────

export function parseNfceUrl(url: string): NfceResult {
  const accessKey = url.match(/\d{44}/)?.[0]
  let storeName: string | undefined
  try {
    storeName = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    storeName = undefined
  }
  return { url, accessKey, storeName }
}

// ─── Entry point para HTML da SEFAZ ──────────────────────────────────────────

export function parseNfceHtmlResponse(html: string): ParsedReceipt {
  return parseNfceHtml(html)
}
