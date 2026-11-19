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
  paymentMethod?: string
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

// ─── Linhas que devem ser descartadas do processamento ────────────────────────

function isStatusOrBrowserJunk(line: string): boolean {
  const l = line.trim().toLowerCase()
  // Relógio do celular no topo (ex: "17:47", "17:47 86%", "17:49", "12:30:15")
  if (/^\d{1,2}:\d{2}(?::\d{2})?(?:\s*[-–;.,]\s*[a-z0-9]+|\s+\d{1,3}%)?$/i.test(l)) return true
  // URL de navegador ou cabeçalhos do browser
  if (/(?:alsped|fazenda|sefaz|receita|\.gov\.br|\.br\b|http:\/\/|https:\/\/|www\.)/i.test(l)) return true
  // Barra de pesquisa do site ("Filtrar itens...", "Pesquisar")
  if (/^(?:filtrar|pesquisar|buscar)\s*(?:[ií]tens?|produtos?)?/i.test(l)) return true
  // Botões de sanfona da SEFAZ
  if (/^[+⊕]?\s*(?:consumidor|chave\s+de\s+acesso|informa[cç][oõ]es|consulta|dados\s+da\s+nota)/i.test(l)) return true
  // Porcentagem de bateria isolada
  if (/^\d{1,3}%$/.test(l)) return true
  return false
}

function isFooterOrPayment(line: string): boolean {
  const l = line.trim().toLowerCase()
  // Formas de pagamento (ex: "Valor pago R$ 350.00", "01 - Dinheiro", "Forma de Pagamento")
  if (/(?:valor\s+pago|forma\s+de\s+pagamento|\b\d{2}\s*-\s*(?:dinheiro|cart[aã]o|pix|cheque|cr[eé]dito|d[eé]bito|vale))/i.test(l)) return true
  // Totais do rodapé
  if (/(?:valor\s+total\s*r\$|qtde\s+total\s+de\s+[ií]tens|troco|desconto|subtotal|tributos?|vl\.?\s*tributos?)/i.test(l)) return true
  return false
}

// ─── Parser de HTML SEFAZ (quando consulta direta funciona) ──────────────────

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

  // Estratégia 3: fallback para texto puro
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

// ─── Parser de Texto Inteligente (OCR de Prints SEFAZ e Notas em Papel) ───────

export function parseReceiptText(text: string): ParsedReceipt {
  const normalized = text.replace(/[|]/g, ' ').replace(/\r/g, '')
  const rawLines = normalized
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  // Filtra lixo de status bar do celular e barra de navegação
  const lines = rawLines.filter(line => !isStatusOrBrowserJunk(line))

  // 1) Encontra o Total da Nota com precisão (busca no rodapé linhas sem 'Código' e sem 'Qtde')
  let total: number | undefined
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (/\b(?:c[oó]d(?:igo)?|itens:\s*\d|qtde\s+total\s+de\s+[ií]tens:\s*\d)/i.test(line)) continue
    // Padrão: "Valor total R$ 657.18" ou "Valor total R$: 657,18" ou "TOTAL A PAGAR: R$ 657,18"
    const m = line.match(/(?:VALOR\s+TOTAL(?:\s*R\$)?|TOTAL(?:\s+A\s+PAGAR)?|VALOR\s+A\s+PAGAR)\s*(?:R\$\s*)?[:=]?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/i)
    if (m) {
      const val = parseBRL(m[1])
      if (val > 0) {
        total = val
        break
      }
    }
  }

  // 2) CNPJ
  const cnpj = normalized.match(/\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/)?.[0]

  // 3) Nome da Loja / Estabelecimento
  // Pega a primeira linha com texto legítimo do cabeçalho que não seja endereço puro nem palavra técnica
  const storeNameCandidate = lines.find(line => {
    if (line.length < 3 || line.length > 80) return false
    if (/cnpj|cpf|documento|chave|total|nota\s+fiscal|filtar|cupom|endereço|bairro|cep/i.test(line)) return false
    if (/^(?:rua|av\.|avenida|rod\.|rodovia|praça)\b/i.test(line)) return false
    if (/\b(?:sefaz|fazenda|alsped)\b/i.test(line)) return false
    return true
  })
  const storeName = storeNameCandidate?.replace(/^[^A-Za-zÀ-ÿ]+/, '').trim()

  // 4) Forma de Pagamento (ex: "01 - Dinheiro", "Dinheiro", "Cartão de Crédito", "Pix")
  let paymentMethod: string | undefined
  for (const line of lines) {
    if (/dinheiro/i.test(line)) { paymentMethod = 'cash'; break }
    if (/pix/i.test(line)) { paymentMethod = 'pix'; break }
    if (/cr[eé]dito/i.test(line)) { paymentMethod = 'credit'; break }
    if (/d[eé]bito/i.test(line)) { paymentMethod = 'debit'; break }
    if (/vale|alimenta[cç][aã]o|refei[cç][aã]o/i.test(line)) { paymentMethod = 'benefit'; break }
  }

  // 5) Extração Inteligente de Itens da Tabela SEFAZ (incluindo nomes quebrados em 2 linhas)
  const items: ParsedReceiptItem[] = []
  let pendingNamePart = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Ignora linhas de rodapé ou pagamento para não virarem produtos
    if (isFooterOrPayment(line)) {
      pendingNamePart = ''
      continue
    }

    // Extrai o preço real do item:
    // Na SEFAZ vem como: "Valor total R$: R$ 10,89" ou "Valor total R$: 10.89"
    // Ou no final da linha: "R$ 10,89"
    let itemPrice: number | undefined
    let rawItemText = line

    const sefazPriceMatch = line.match(/Valor\s+total\s*R\$\s*[:=]?\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/i)
    if (sefazPriceMatch) {
      itemPrice = parseBRL(sefazPriceMatch[1])
      // Remove a seção de preço da linha para sobrar o nome
      rawItemText = line.slice(0, sefazPriceMatch.index).trim()
    } else {
      // Procura último padrão de moeda que NÃO seja uma quantidade de 4 casas (como 1.0000 ou 0.3020)
      const allPrices = [...line.matchAll(moneyRe())].filter(m => {
        const fullMatch = m[0]
        // Se após o match tiver mais dígitos (ex: "1.0000" onde match pegou "1.00"), é quantidade!
        const after = line.slice((m.index ?? 0) + fullMatch.length, (m.index ?? 0) + fullMatch.length + 3)
        if (/^\d{2}/.test(after)) return false
        return true
      })

      if (allPrices.length) {
        const last = allPrices[allPrices.length - 1]
        itemPrice = parseBRL(last[0])
        rawItemText = line.slice(0, last.index ?? line.length).trim()
      }
    }

    // Extrai quantidade se presente (ex: "Qtde total de ítens: 1.0000" ou "Qtd: 2.000")
    let quantity: number | undefined
    const qtyMatch = line.match(/(?:Qtde(?:\s+total)?(?:\s+de\s+[ií]tens)?|Qtd)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i)
    if (qtyMatch) {
      quantity = parseBRL(qtyMatch[1])
    }

    // Limpa referências a colunas de quantidade, unidade e códigos de produto do texto do nome
    let cleanedLineName = rawItemText
      .replace(/Qtde(?:\s+total)?(?:\s+de\s+[ií]tens)?\s*[:=]?\s*\d+(?:[.,]\d+)?/gi, '')
      .replace(/\bUN\s*:\s*[A-Z]{1,3}\b/gi, '')
      .replace(/\(c[oó]d(?:igo)?\.?:?\s*\d+\)/gi, '')
      .replace(/\bc[oó]d(?:igo)?\.?:?\s*\d+\b/gi, '')
      .replace(/^\d{4,}\s*/, '')
      .trim()

    // Se a linha NÃO tem preço:
    // Provavelmente é a primeira linha de um nome quebrado (ex: "FEIJAO UGOBOM 1kg")
    if (!itemPrice || itemPrice <= 0) {
      // Se a linha tem caracteres de texto substanciais e não é cabeçalho técnico:
      if (cleanedLineName.length >= 3 && !/^(?:total|subtotal|cnpj|cpf|forma\s+de)/i.test(cleanedLineName)) {
        pendingNamePart = cleanedLineName
      }
      continue
    }

    // A linha TEM preço!
    // Se tínhamos um pedaço de nome na linha anterior, juntamos (ex: "FEIJAO UGOBOM 1kg" + "CARIOCA T1")
    let finalName = cleanedLineName
    if (pendingNamePart) {
      finalName = `${pendingNamePart} ${cleanedLineName}`.trim()
      pendingNamePart = ''
    }

    finalName = cleanProductName(finalName)

    // Se o nome ficou muito curto ou só sobrou números / símbolos, ignora
    if (finalName.length < 2 || /^[\d\s.,;:-]+$/.test(finalName)) {
      continue
    }

    // Tenta extrair itemIndex se a linha começar com número (ex: "001 ARROZ")
    let itemIndex: number | undefined
    const idxMatch = finalName.match(/^#?\s*0*([1-9]\d{0,2})\b/)
    if (idxMatch) {
      itemIndex = parseInt(idxMatch[1], 10)
      finalName = cleanProductName(finalName.slice(idxMatch[0].length))
    }

    items.push({
      name: finalName,
      totalPrice: itemPrice,
      quantity: quantity || 1,
      unitPrice: quantity && quantity > 0 ? parseFloat((itemPrice / quantity).toFixed(2)) : itemPrice,
      itemIndex,
    })
  }

  // Se o total não foi encontrado explicitamente no rodapé mas temos itens, soma
  const calculatedTotal = total ?? (
    items.length
      ? parseFloat(items.reduce((s, it) => s + (it.totalPrice ?? 0), 0).toFixed(2))
      : undefined
  )

  return {
    total: calculatedTotal,
    storeName,
    cnpj,
    paymentMethod,
    lines,
    items: dedupe(items),
  }
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
  if (a.itemIndex !== undefined && b.itemIndex !== undefined) {
    return a.itemIndex === b.itemIndex
  }

  const priceA = a.totalPrice ?? 0
  const priceB = b.totalPrice ?? 0
  if (Math.abs(priceA - priceB) > 0.05) return false

  const normA = normalizeName(a.name)
  const normB = normalizeName(b.name)
  if (!normA || !normB) return false
  if (normA === normB) return true

  if (normA.length >= 5 && normB.length >= 5) {
    if (normA.includes(normB) || normB.includes(normA)) return true
    if (stringSimilarity(normA, normB) >= 0.72) return true
  }

  return false
}

function mergeTwoItemLists(
  listA: ParsedReceiptItem[],
  listB: ParsedReceiptItem[],
): { merged: ParsedReceiptItem[]; dupes: number } {
  if (!listA.length) return { merged: listB, dupes: 0 }
  if (!listB.length) return { merged: listA, dupes: 0 }

  const maxOverlap = Math.min(listA.length, listB.length)

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

export function mergeParsedReceipts(receipts: ParsedReceipt[]): ParsedReceipt {
  if (!receipts.length) {
    return { lines: [], items: [] }
  }
  if (receipts.length === 1) {
    return receipts[0]
  }

  const storeName = receipts.find(r => r.storeName)?.storeName
  const cnpj = receipts.find(r => r.cnpj)?.cnpj
  const paymentMethod = receipts.find(r => r.paymentMethod)?.paymentMethod
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
    paymentMethod,
    total: finalTotal,
    lines: allLines,
    items: dedupe(mergedItems),
    duplicatesRemoved: totalDupes,
  }
}
