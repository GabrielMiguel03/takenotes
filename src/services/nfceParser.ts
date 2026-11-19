export type NfceResult = { url: string; accessKey?: string; storeName?: string; text?: string }
export type ParsedReceipt = {
  total?: number
  storeName?: string
  cnpj?: string
  lines: string[]
  items: Array<{ name: string; totalPrice?: number }>
}

function parseBrazilianMoney(value: string) {
  const normalized = value.replace(/R\$\s*/i, '').replace(/\s/g, '')
  return Number(normalized.includes(',') ? normalized.replace(/\./g, '').replace(',', '.') : normalized)
}

export function parseNfceUrl(url: string): NfceResult {
  const accessKey = url.match(/\d{44}/)?.[0]
  let storeName: string | undefined
  try { storeName = new URL(url).hostname.replace(/^www\./, '') } catch { storeName = undefined }
  return { url, accessKey, storeName }
}

export function parseReceiptText(text: string): ParsedReceipt {
  const total = text.match(/(?:TOTAL|VALOR\s+A\s+PAGAR)[^\d]*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[,.]\d{2})/i)?.[1]
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const cnpj = text.match(/\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/)?.[0]
  const storeName = lines.find(line => line.length > 3 && !/cnpj|cpf|documento|consumidor|chave|total/i.test(line))
  const items = lines
    .map(line => {
      const match = line.match(/^(.+?)\s+(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[,.]\d{2})$/)
      if (!match || /total|troco|desconto|pagamento/i.test(match[1])) return undefined
      return { name: match[1].trim(), totalPrice: parseBrazilianMoney(match[2]) }
    })
    .filter((item): item is { name: string; totalPrice: number } => Boolean(item))
  return {
    total: total ? parseBrazilianMoney(total) : undefined,
    storeName,
    cnpj,
    lines,
    items,
  }
}
