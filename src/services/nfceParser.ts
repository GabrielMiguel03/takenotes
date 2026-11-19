export type NfceResult = { url: string; accessKey?: string; storeName?: string; text?: string }

export type ParsedReceiptItem = {
  name: string
  totalPrice?: number
  quantity?: number
  unitPrice?: number
  itemIndex?: number
}

export type ParsedReceipt = {
  total?: number
  storeName?: string
  cnpj?: string
  lines: string[]
  items: ParsedReceiptItem[]
  duplicatesRemoved?: number
}

// ─── Utilitários monetários ───────────────────────────────────────────────────

function parseBRL(value: string): number {
  const v = value.replace(/R\$\s*/i, '').trim()
  if (v.includes(',')) return parseFloat(v.replace(/\./g, '').replace(',', '.'))
  return parseFloat(v)
}

function moneyRe() {
  return /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/gi
}

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
    .replace(/^[^A-Za-zÀ-ÿ0-9]+/, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*\b\d+\s*(?:UN|KG|GR?|ML|LT?)\b\s*$/i, '')
    .replace(/\s*x\s*\d+([.,]\d+)?\s*$/i, '')
    .trim()
}

// ─── Palavras-chave de exclusão de linha ──────────────────────────────────────

const SKIP_LINE_RE = /\b(total|troco|desconto|pagamento|subtotal|cnpj|cpf|documento|chave|cupom|nota fiscal|forma de|endere[cç]|fone|tel\b|sit\.|data\s+emiss|n[uú]mero|insc|iest|uf\b|cod\.?\s*bar|via\s+do|contribui|tributad|cst\b|icms|ipi\b|cfop|ncm\b|un\s+med|vl\s+unit|qtd?\.?\s*\d|qt\b|sat|ecf\b|dv\b)\b/i

// ─── Parser principal de HTML SEFAZ ──────────────────────────────────────────

function parseNfceHtml(html: string): ParsedReceipt {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  // 1) Nome da loja
  const storeSelectors = [
    '#txtNomeEmit', '#nomeEmitente', '.txtTopo', '.x-emitente',
    '[class*="emit"]', '[id*="emit"]', '[class*="empresa"]',
  ]
  let storeName: string | undefined
  for (const sel of storeSelectors) {
    const text = doc.querySelector(sel)?.textContent?.trim()
    if (text && text.length > 2 && text.length < 100) {
      storeName = text
      break
    }
  }

  // 2) CNPJ
  const cnpjMatch = doc.body.textContent?.match(/\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/)
  const cnpj = cnpjMatch?.[0]

  // 3) Total
  const totalSelectors = [
    '#totais', '#vlrTotalNota', '#total', '#totalNF', '#vlTotal',
    '[id*="total"]', '[class*="total"]',
  ]
  let total: number | undefined
  for (const sel of totalSelectors) {
    const text = doc.querySelector(sel)?.textContent
    if (text) {
      const v = firstMoney(text)
      if (v && v > 0) {
        total = v
        break
      }
    }
  }

  // 4) Itens — tabela de produtos
  const items: ParsedReceiptItem[] = []
  const tableRows = doc.querySelectorAll('table tr')

  if (tableRows.length > 1) {
    const headerRow = tableRows[0]
    const headers = [...headerRow.querySelectorAll('th,td')].map(td => td.textContent?.toLowerCase().trim() ?? '')

    const colName = headers.findIndex(h => /descri|produto|item|nome/i.test(h))
    const colQty = headers.findIndex(h => /qtd|qt\b|quant/i.test(h))
    const colUnit = headers.findIndex(h => /unit|vl\s*un|pr\s*un/i.test(h))
    const colTot = headers.findIndex(h => /total|vl\s*tot|subtot/i.test(h))

    for (let i = 1; i < tableRows.length; i++) {
      const cells = [...tableRows[i].querySelectorAll('td')]
      if (cells.length < 2) continue
      const rawName = cells[colName >= 0 ? colName : 0]?.textContent?.trim() ?? ''
      const name = cleanProductName(rawName)
      if (name.length < 2) continue
      const quantity = colQty >= 0 ? parseBRL(cells[colQty]?.textContent?.replace(',', '.') ?? '1') || 1 : undefined
      const unitPrice = colUnit >= 0 ? firstMoney(cells[colUnit]?.textContent ?? '') : undefined
      const totalPrice = colTot >= 0
        ? firstMoney(cells[colTot]?.textContent ?? '')
        : (unitPrice && quantity ? unitPrice * quantity : undefined)
      items.push({ name, quantity, unitPrice, totalPrice, itemIndex: i })
    }
  }

  // Estratégia 2: divs/spans semânticas
  if (!items.length) {
    const prodContainers = doc.querySelectorAll(
      '[class*="item"], [class*="prod"], [id*="prod"], [class*="Prod"], [id*="item"]',
    )
    let idx = 1
    prodContainers.forEach(container => {
      const text = container.textContent?.trim() ?? ''
      if (!text || text.length < 3) return
      const totalPrice = lastMoney(text)
      if (!totalPrice) return
      const rawName = text.split(/\d/)[0].trim()
      const name = cleanProductName(rawName)
      if (name.length >= 2) {
        items.push({ name, totalPrice, itemIndex: idx++ })
      }
    })
  }

  // Estratégia 3: fallback para texto
  if (!items.length) {
    return { ...parseReceiptText(doc.body.textContent ?? ''), storeName: storeName ?? undefined, cnpj: cnpj ?? undefined, total: total }
  }

  const unique = dedupe(items)
  if (!total && unique.length) {
    const sum = unique.reduce((acc, i) => acc + (i.totalPrice ?? 0), 0)
    if (sum > 0) total = parseFloat(sum.toFixed(2))
  }

  const lines = (doc.body.textContent ?? '').split('\n').map(l => l.trim()).filter(Boolean)
  return { total, storeName, cnpj, lines, items: unique }
}

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

  const totalMatch = normalized.match(
    /(?:TOTAL(?:\s+A\s+PAGAR)?|VALOR\s+A\s+PAGAR|VALOR\s+TOTAL)[^\d]*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[,.]?\d{2})/i,
  )
  const total = totalMatch ? parseBRL(totalMatch[1]) : undefined
  const cnpj = normalized.match(/\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/)?.[0]

  const storeName = lines.find(
    line => line.length > 3 && !/cnpj|cpf|documento|consumidor|chave|total|cupom|nota fiscal|endere[cç]|sit\.|data/i.test(line),
  )

  const items: ParsedReceiptItem[] = []
  for (const line of lines) {
    if (SKIP_LINE_RE.test(line)) continue
    const all = [...line.matchAll(moneyRe())]
    if (!all.length) continue
    const last = all[all.length - 1]
    const price = last[0]
    let before = line.slice(0, last.index ?? line.length).trim()

    // Extrai índice do item se presente (ex.: "001 ARROZ", "1 ARROZ", "#02 FEIJÃO")
    let itemIndex: number | undefined
    const idxMatch = before.match(/^#?\s*0*([1-9]\d{0,2})\b/)
    if (idxMatch) {
      const parsed = parseInt(idxMatch[1], 10)
      if (parsed > 0 && parsed < 1000) {
        itemIndex = parsed
        before = before.slice(idxMatch[0].length).trim()
      }
    }

    // Remove referências a código do produto
    before = before
      .replace(/\(c[oó]d(?:igo)?\.?:?\s*\d+\)/gi, '')
      .replace(/\bc[oó]d(?:igo)?\.?:?\s*\d+\b/gi, '')
      .replace(/^\d{4,}\s*/, '')

    const name = cleanProductName(
      before
        .replace(/^\d{3,}\s*/, '')
        .replace(/\b\d+\s*(?:UN|KG|GR?|ML|LT?)\b/gi, '')
        .replace(/\b\d+([,.]?\d+)?\s*x\s*/gi, ''),
    )
    if (name.length < 2 || /^\d+$/.test(name)) continue
    const totalPrice = parseBRL(price)
    if (!isFinite(totalPrice) || totalPrice <= 0) continue
    items.push({ name, totalPrice, itemIndex })
  }

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

export function parseNfceHtmlResponse(html: string): ParsedReceipt {
  return parseNfceHtml(html)
}

// ─── Comparação & Desduplicação Inteligente de Múltiplos Prints ──────────────

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function stringSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1
  if (s1.length < 2 || s2.length < 2) return 0
  const bigrams = new Map<string, number>()
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.substring(i, i + 2)
    bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1)
  }
  let intersection = 0
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.substring(i, i + 2)
    const count = bigrams.get(bg) ?? 0
    if (count > 0) {
      bigrams.set(bg, count - 1)
      intersection++
    }
  }
  return (2.0 * intersection) / (s1.length + s2.length - 2)
}

export function areItemsDuplicate(a: ParsedReceiptItem, b: ParsedReceiptItem): boolean {
  // Se ambos têm itemIndex, a identificação é direta
  if (a.itemIndex !== undefined && b.itemIndex !== undefined) {
    return a.itemIndex === b.itemIndex
  }

  // Preço idêntico (tolerância de até R$ 0.05 para pequenas variações de OCR)
  const priceA = a.totalPrice ?? 0
  const priceB = b.totalPrice ?? 0
  if (Math.abs(priceA - priceB) > 0.05) return false

  const normA = normalizeName(a.name)
  const normB = normalizeName(b.name)
  if (!normA || !normB) return false
  if (normA === normB) return true

  // Substring match para produtos com nomes mais longos
  if (normA.length >= 5 && normB.length >= 5) {
    if (normA.includes(normB) || normB.includes(normA)) return true
    if (stringSimilarity(normA, normB) >= 0.72) return true
  }

  return false
}

/**
 * Mescla duas listas de itens identificando a sobreposição de rolagem (scroll overlap).
 * Exemplo:
 * Print 1: [Item 1, Item 2, Item 3, Item 4]
 * Print 2: [Item 3, Item 4, Item 5, Item 6]
 * Resultado: [Item 1, Item 2, Item 3, Item 4, Item 5, Item 6] (2 duplicatas eliminadas)
 */
function mergeTwoItemLists(
  listA: ParsedReceiptItem[],
  listB: ParsedReceiptItem[],
): { merged: ParsedReceiptItem[]; dupes: number } {
  if (!listA.length) return { merged: listB, dupes: 0 }
  if (!listB.length) return { merged: listA, dupes: 0 }

  const maxOverlap = Math.min(listA.length, listB.length)

  // 1. Testa se o fim de A se sobrepõe ao início de B (scroll natural para baixo)
  for (let k = maxOverlap; k >= 1; k--) {
    let matchCount = 0
    for (let i = 0; i < k; i++) {
      if (areItemsDuplicate(listA[listA.length - k + i], listB[i])) {
        matchCount++
      }
    }
    if (matchCount === k || (k >= 3 && matchCount / k >= 0.8)) {
      const nonOverlappingFromB = listB.slice(k)
      return {
        merged: [...listA, ...nonOverlappingFromB],
        dupes: k,
      }
    }
  }

  // 2. Testa se o fim de B se sobrepõe ao início de A (caso selecionados na ordem inversa)
  for (let k = maxOverlap; k >= 1; k--) {
    let matchCount = 0
    for (let i = 0; i < k; i++) {
      if (areItemsDuplicate(listB[listB.length - k + i], listA[i])) {
        matchCount++
      }
    }
    if (matchCount === k || (k >= 3 && matchCount / k >= 0.8)) {
      const nonOverlappingFromA = listA.slice(k)
      return {
        merged: [...listB, ...nonOverlappingFromA],
        dupes: k,
      }
    }
  }

  // 3. Fallback: sobreposição não-contígua / itens esparsos
  let dupes = 0
  const result = [...listA]
  for (const itemB of listB) {
    const exists = result.some(itemA => areItemsDuplicate(itemA, itemB))
    if (exists) {
      dupes++
    } else {
      result.push(itemB)
    }
  }

  return { merged: result, dupes }
}

/**
 * Mescla múltiplos resultados de OCR (por exemplo, 2 ou mais prints da mesma nota).
 * Mantém o cabeçalho, total e elimina automaticamente os itens repetidos das áreas de sobreposição.
 */
export function mergeParsedReceipts(receipts: ParsedReceipt[]): ParsedReceipt {
  if (!receipts.length) {
    return { lines: [], items: [] }
  }
  if (receipts.length === 1) {
    return receipts[0]
  }

  const storeName = receipts.find(r => r.storeName)?.storeName
  const cnpj = receipts.find(r => r.cnpj)?.cnpj
  const total = receipts.slice().reverse().find(r => r.total !== undefined)?.total
  const allLines = receipts.flatMap(r => r.lines)

  let mergedItems = receipts[0].items
  let totalDupes = 0

  for (let i = 1; i < receipts.length; i++) {
    const { merged, dupes } = mergeTwoItemLists(mergedItems, receipts[i].items)
    mergedItems = merged
    totalDupes += dupes
  }

  const finalTotal = total ?? (
    mergedItems.length
      ? parseFloat(mergedItems.reduce((s, it) => s + (it.totalPrice ?? 0), 0).toFixed(2))
      : undefined
  )

  return {
    storeName,
    cnpj,
    total: finalTotal,
    lines: allLines,
    items: dedupe(mergedItems),
    duplicatesRemoved: totalDupes,
  }
}
