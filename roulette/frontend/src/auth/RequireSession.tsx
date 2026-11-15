import { Navigate, useLocation } from 'react-router-dom'
import { useT } from '../i18n/I18nContext'
import { useSession } from './SessionContext'

/**
 * Keeps the admin behind a session (F07 R22).
 *
 * The checking state matters: rendering the login page while the session is
 * still being confirmed would flash it in front of someone who is in fact
 * signed in, on every single page load.
 */
export function RequireSession({ children }: { children: React.ReactNode }) {
  const session = useSession()
  const t = useT()
  const location = useLocation()

  if (session.phase === 'checking') {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <p role="status" className="text-sm text-slate-500">
          {t('admin.checkingSession')}
        </p>
      </main>
    )
  }

  if (session.phase === 'signed-out') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}
