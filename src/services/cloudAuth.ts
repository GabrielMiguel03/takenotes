export type AuthResponse = { access_token: string; refresh_token: string; user: { id: string; email?: string } }

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined
export const cloudEnabled = Boolean(url && key && !url.includes('seu-projeto'))

function headers(token?: string) {
  return { apikey: key ?? '', Authorization: `Bearer ${token ?? key ?? ''}`, 'Content-Type': 'application/json' }
}

export async function signUp(email: string, password: string, displayName: string) {
  if (!cloudEnabled) throw new Error('Backend não configurado')
  const response = await fetch(`${url}/auth/v1/signup`, { method: 'POST', headers: headers(), body: JSON.stringify({ email, password, data: { display_name: displayName } }) })
  if (!response.ok) throw new Error((await response.json()).msg ?? 'Não foi possível criar a conta')
  return response.json() as Promise<AuthResponse>
}

export async function signIn(email: string, password: string) {
  if (!cloudEnabled) throw new Error('Backend não configurado')
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: headers(), body: JSON.stringify({ email, password }) })
  if (!response.ok) throw new Error((await response.json()).error_description ?? 'E-mail ou senha inválidos')
  return response.json() as Promise<AuthResponse>
}

export async function signOut(token: string) {
  if (cloudEnabled) await fetch(`${url}/auth/v1/logout`, { method: 'POST', headers: headers(token) })
}
