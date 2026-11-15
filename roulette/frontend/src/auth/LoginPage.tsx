import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useT } from '../i18n/I18nContext'
import { LoginForm } from './LoginForm'
import { useSession } from './SessionContext'

/**
 * F07 R21, R24. Unthemed like the rest of the admin: this is a tool, not
 * part of the campaign, and it should never be mistaken for the player page.
 */
export function LoginPage() {
  const t = useT()
  const session = useSession()
  const navigate = useNavigate()
  const location = useLocation()

  const from = (location.state as { from?: string } | null)?.from ?? '/admin'

  // F07 R22: already signed in, so there is nothing to ask.
  if (session.phase === 'signed-in') {
    return <Navigate to={from} replace />
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            {t('admin.title')}
          </p>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">{t('login.heading')}</h1>
        </header>

        <LoginForm onSignedIn={() => void navigate(from, { replace: true })} />

        <p className="mt-6 text-xs text-slate-500">
          Accounts are created on the server with{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5">app:create-admin</code>.
        </p>
      </div>
    </main>
  )
}
