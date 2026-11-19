import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { LogIn, UserPlus, Eye, EyeOff, Receipt } from 'lucide-react'
import { cloudEnabled, signIn, signUp, type AuthResponse } from '../services/cloudAuth'

function readSavedSession() {
  const raw = localStorage.getItem('notacontrol-session')
  return raw ? JSON.parse(raw) as AuthResponse : null
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthResponse | null>(readSavedSession)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  // Limpa erros ao trocar de modo
  useEffect(() => { setError(''); setInfo('') }, [mode])

  if (session) return <>{children}</>

  const emailOk = isValidEmail(email)
  const passwordOk = password.length >= 6
  const nameOk = mode === 'login' || name.trim().length >= 2
  const canSubmit = emailOk && passwordOk && nameOk && !busy && cloudEnabled

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true); setError(''); setInfo('')
    try {
      const result = mode === 'login'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password, name.trim())

      if (!result.access_token) {
        setInfo('Conta criada! Verifique seu e-mail para confirmar o cadastro antes de entrar.')
        setBusy(false)
        return
      }
      localStorage.setItem('notacontrol-session', JSON.stringify(result))
      setSession(result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível concluir. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') void submit()
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-5 text-slate-900">
      <section className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-7 shadow-xl">
        {/* Logo */}
        <div className="mb-7 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-slate-900 text-brand-500">
            <Receipt size={26} />
          </div>
          <h1 className="mt-4 text-2xl font-bold">TakeNotes</h1>
          <p className="mt-1 text-sm text-slate-500">
            {mode === 'login'
              ? 'Entre para acessar seus dados.'
              : 'Crie sua conta gratuitamente.'}
          </p>
        </div>

        {!cloudEnabled && (
          <p className="mb-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
            ⚠️ Variáveis do Supabase não configuradas no Netlify.
          </p>
        )}

        {/* Nome (somente cadastro) */}
        {mode === 'signup' && (
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-slate-600">Nome</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Seu nome"
              autoComplete="name"
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
        )}

        {/* E-mail */}
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-slate-600">E-mail</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="voce@email.com"
            autoComplete="email"
            className={`w-full rounded-xl border px-3 py-3 text-sm outline-none transition focus:ring-2 focus:ring-brand-500/20 ${
              email && !emailOk ? 'border-rose-400 focus:border-rose-400' : 'border-slate-200 focus:border-brand-500'
            }`}
          />
          {email && !emailOk && (
            <p className="mt-1 text-xs text-rose-500">Digite um e-mail válido.</p>
          )}
        </div>

        {/* Senha */}
        <div className="mb-5">
          <label className="mb-1 block text-xs font-medium text-slate-600">Senha</label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={mode === 'signup' ? 'Mínimo 6 caracteres' : '••••••••'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className={`w-full rounded-xl border px-3 py-3 pr-10 text-sm outline-none transition focus:ring-2 focus:ring-brand-500/20 ${
                password && !passwordOk ? 'border-rose-400 focus:border-rose-400' : 'border-slate-200 focus:border-brand-500'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPass(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              tabIndex={-1}
              aria-label={showPass ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {password && !passwordOk && (
            <p className="mt-1 text-xs text-rose-500">A senha deve ter no mínimo 6 caracteres.</p>
          )}
        </div>

        {/* Erro */}
        {error && (
          <p className="mb-4 rounded-xl bg-rose-50 px-3 py-2.5 text-xs text-rose-700">{error}</p>
        )}

        {/* Aviso de confirmação de e-mail */}
        {info && (
          <p className="mb-4 rounded-xl bg-brand-50 px-3 py-2.5 text-xs text-brand-700">{info}</p>
        )}

        {/* Botão principal */}
        <button
          disabled={!canSubmit}
          onClick={() => void submit()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 p-3 font-bold text-slate-950 transition hover:bg-brand-600 disabled:opacity-50"
        >
          {mode === 'login' ? <LogIn size={17} /> : <UserPlus size={17} />}
          {busy ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
        </button>

        {/* Troca de modo */}
        <button
          onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
          className="mt-4 w-full text-sm font-semibold text-brand-700 hover:underline"
        >
          {mode === 'login' ? 'Ainda não tenho conta' : 'Já tenho uma conta'}
        </button>
      </section>
    </main>
  )
}
