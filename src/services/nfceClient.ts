import { parseNfceHtmlResponse, parseReceiptText, type ParsedReceipt } from './nfceParser'

/**
 * Chama o proxy Netlify para buscar o HTML da SEFAZ e faz o parse.
 * Em caso de erro de rede ou resposta ruim, lança um Error.
 */
export async function fetchNfceData(nfceUrl: string): Promise<ParsedReceipt> {
  const proxyUrl = `/.netlify/functions/nfce-proxy?url=${encodeURIComponent(nfceUrl)}`

  let response: Response
  try {
    response = await fetch(proxyUrl, { signal: AbortSignal.timeout(20_000) })
  } catch {
    throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão.')
  }

  if (!response.ok) {
    throw new Error(`SEFAZ indisponível (${response.status}). Use o modo manual ou foto/OCR.`)
  }

  const html = await response.text()

  // Verifica se o conteúdo parece HTML válido (páginas SEFAZ sempre retornam HTML)
  const isHtml = html.trim().toLowerCase().startsWith('<!') || html.includes('<html')
  if (!isHtml) {
    // Trata como texto puro (raro, mas possível em alguns estados)
    return parseReceiptText(html)
  }

  return parseNfceHtmlResponse(html)
}
