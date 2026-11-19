type NetlifyEvent = {
  queryStringParameters?: Record<string, string | undefined>
}

const UF = '(ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)'

function allowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return (
    new RegExp(`(^|\\.)sefaz\\.${UF}\\.gov\\.br$`).test(h) ||
    new RegExp(`(^|\\.)fazenda\\.${UF}\\.gov\\.br$`).test(h) ||
    /(^|\.)sef\.sc\.gov\.br$/.test(h) ||
    /(^|\.)nfe\.fazenda\.gov\.br$/.test(h) ||
    /(^|\.)sat\.sef\.sc\.gov\.br$/.test(h) ||
    /(^|\.)nfce\.sefaz\.rs\.gov\.br$/.test(h) ||
    /(^|\.)www\.sefaz\.sp\.gov\.br$/.test(h)
  )
}

export default async function handler(event: NetlifyEvent): Promise<Response> {
  const rawUrl = event.queryStringParameters?.url
  if (!rawUrl) {
    return new Response('Parâmetro url obrigatório', { status: 400 })
  }

  let target: URL
  try {
    target = new URL(rawUrl)
  } catch {
    return new Response('URL inválida', { status: 400 })
  }

  if (!['http:', 'https:'].includes(target.protocol) || !allowedHost(target.hostname)) {
    return new Response('Host de NFC-e não permitido', { status: 403 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  try {
    const response = await fetch(target.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
      },
    })

    const contentType = response.headers.get('content-type') ?? 'text/html; charset=utf-8'
    const body = await response.text()

    return new Response(body, {
      status: response.status,
      headers: {
        'content-type': contentType,
        'cache-control': 'no-store',
        'x-nfce-status': String(response.status),
      },
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return new Response('Tempo limite excedido ao consultar a NFC-e', { status: 504 })
    }
    return new Response('Não foi possível consultar a NFC-e', { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
