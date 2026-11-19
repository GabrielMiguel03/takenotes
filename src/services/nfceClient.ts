import { parseReceiptText, type ParsedReceipt } from './nfceParser'

export async function fetchNfceData(url: string): Promise<ParsedReceipt> {
  const response = await fetch(`/.netlify/functions/nfce-proxy?url=${encodeURIComponent(url)}`)
  if (!response.ok) throw new Error('Consulta da NFC-e indisponível')
  const html = await response.text()
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent ?? html
  return parseReceiptText(text)
}
