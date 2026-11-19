export type NfceResult = { url: string; accessKey?: string; storeName?: string; text?: string }
export type ParsedReceipt = { total?: number; storeName?: string; cnpj?: string; lines: string[]; items: Array<{ name: string; totalPrice?: number }> }

function parseBrazilianMoney(value: string) { const normalized = value.replace(/R\$\s*/i, '').replace(/\s/g, ''); return Number(normalized.includes(',') ? normalized.replace(/\./g, '').replace(',', '.') : normalized) }
function moneyPattern() { return '(?:R\\$\\s*)?(?:\\d{1,3}(?:\\.\\d{3})*,\\d{2}|\\d+[,.]\\d{2})' }
function cleanName(value: string) { return value.replace(/^[^A-Za-zÀ-ÿ]+/, '').replace(/\s{2,}/g, ' ').replace(/\s+(?:UN|KG|G|ML|L)\s*$/i, '').trim() }

export function parseNfceUrl(url: string): NfceResult { const accessKey = url.match(/\d{44}/)?.[0]; let storeName: string | undefined; try { storeName = new URL(url).hostname.replace(/^www\./, '') } catch { storeName = undefined }; return { url, accessKey, storeName } }

export function parseReceiptText(text: string): ParsedReceipt {
  const normalized = text.replace(/[|]/g, ' ').replace(/\r/g, '')
  const lines = normalized.split('\n').map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const totalMatch = normalized.match(/(?:TOTAL(?:\s+A\s+PAGAR)?|VALOR\s+A\s+PAGAR|VALOR\s+TOTAL)[^\d]*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[,.]\d{2})/i)
  const cnpj = normalized.match(/\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/)?.[0]
  const storeName = lines.find(line => line.length > 3 && !/cnpj|cpf|documento|consumidor|chave|total|cupom|nota fiscal|endereço/i.test(line))
  const items = lines.map(line => {
    if (/total|troco|desconto|pagamento|subtotal|cnpj|cpf|documento|chave|forma de/i.test(line)) return undefined
    const values = [...line.matchAll(new RegExp(moneyPattern(), 'gi'))]
    if (!values.length) return undefined
    const last = values[values.length - 1]
    const price = last[0]
    const before = line.slice(0, last.index ?? line.length)
    const name = cleanName(before.replace(/\b\d+[,.]?\d*\s*(?:UN|KG|G|ML|L)?\s*$/i, ''))
    if (name.length < 2 || /^\d+$/.test(name)) return undefined
    return { name, totalPrice: parseBrazilianMoney(price) }
  }).filter((item): item is { name: string; totalPrice: number } => Boolean(item))
  const unique = items.filter((item, index, all) => all.findIndex(other => other.name.toLowerCase() === item.name.toLowerCase() && other.totalPrice === item.totalPrice) === index)
  return { total: totalMatch ? parseBrazilianMoney(totalMatch[1]) : undefined, storeName, cnpj, lines, items: unique }
}
