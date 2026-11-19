export type AuthResponse = { access_token: string; refresh_token: string; user: { id: string; email?: string } }

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined
export const cloudEnabled = Boolean(url && key && !url.includes('seu-projeto'))

function headers(token?: string) {
  return { apikey: key ?? '', Authorization: `Bearer ${token ?? key ?? ''}`, 'Content-Type': 'application/json' }
}

export async function signUp(email: string, password: string, displayName: string): Promise<AuthResponse> {
  if (!cloudEnabled) throw new Error('Backend não configurado')
  const response = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email, password, data: { display_name: displayName } }),
  })
  const json = await response.json() as Record<string, unknown>
  if (!response.ok) {
    const msg = (json.msg ?? json.error_description ?? json.error ?? 'Não foi possível criar a conta') as string
    throw new Error(translateError(msg))
  }
  return json as AuthResponse
}

export async function signIn(email: string, password: string): Promise<AuthResponse> {
  if (!cloudEnabled) throw new Error('Backend não configurado')
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email, password }),
  })
  const json = await response.json() as Record<string, unknown>
  if (!response.ok) {
    const msg = (json.error_description ?? json.error ?? 'E-mail ou senha inválidos') as string
    throw new Error(translateError(msg))
  }
  return json as AuthResponse
}

export async function signOut(token: string) {
  if (cloudEnabled) {
    await fetch(`${url}/auth/v1/logout`, { method: 'POST', headers: headers(token) }).catch(() => undefined)
  }
}

function translateError(msg: string): string {
  const lower = msg.toLowerCase()
  if (lower.includes('invalid login credentials') || lower.includes('invalid email or password')) return 'E-mail ou senha inválidos.'
  if (lower.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.'
  if (lower.includes('user already registered') || lower.includes('already registered')) return 'Este e-mail já está cadastrado.'
  if (lower.includes('password should be')) return 'A senha deve ter no mínimo 6 caracteres.'
  if (lower.includes('rate limit')) return 'Muitas tentativas. Aguarde alguns minutos.'
  if (lower.includes('network') || lower.includes('failed to fetch')) return 'Erro de conexão. Verifique sua internet.'
  return msg
}
