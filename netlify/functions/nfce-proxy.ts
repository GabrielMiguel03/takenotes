type NetlifyEvent = {
  queryStringParameters?: Record<string, string | undefined>
}

const allowedHost = (hostname: string) => {
  const value = hostname.toLowerCase()
  const uf = '(ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)'
  return new RegExp(`(^|\\.)sefaz\\.${uf}\\.gov\\.br$`).test(value)
    || new RegExp(`(^|\\.)fazenda\\.${uf}\\.gov\\.br$`).test(value)
    || /(^|\.)sef\.sc\.gov\.br$/.test(value)
    || value === 'www.nfe.fazenda.gov.br'
}

export default async function handler(event: NetlifyEvent) {
  const rawUrl = event.queryStringParameters?.url
  if (!rawUrl) return new Response('Parâmetro url obrigatório', { status: 400 })

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
  const timeout = setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetch(target, {
      signal: controller.signal,
      headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'NotaControl/1.0' },
    })
    const body = await response.text()
    return new Response(body, {
      status: response.status,
      headers: { 'content-type': response.headers.get('content-type') ?? 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    })
  } catch {
    return new Response('Não foi possível consultar a NFC-e', { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
