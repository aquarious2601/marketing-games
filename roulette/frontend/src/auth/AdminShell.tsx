import { useT } from '../i18n/I18nContext'
import { LanguagePicker } from '../i18n/LanguagePicker'
import { LoginForm } from './LoginForm'
import { useSession } from './SessionContext'

/**
 * The frame around the admin: who is signed in, how to leave, and what
 * happens when the session ends mid-edit (F07 R23, R25).
 *
 * Deliberately a wrapper rather than part of AdminPage, so the page stays
 * about configuring the game and knows nothing about sessions.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const session = useSession()
  const t = useT()

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            {t('admin.title')}
          </span>

          <div className="flex items-center gap-3">
            {/* F12 R5: beside the user and Sign out, where the frame's own
                controls live. */}
            <LanguagePicker variant="admin" />
            {session.user !== null && (
              <span className="text-sm text-slate-600" data-testid="signed-in-as">
                {session.user.username}
              </span>
            )}
            <button
              type="button"
              onClick={() => void session.signOut()}
              data-testid="sign-out"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t('admin.signOut')}
            </button>
          </div>
        </div>
      </header>

      {children}

      {/* F07 R25. An overlay rather than a redirect: the admin may have a
          half-edited prize list on screen, and throwing it away because a
          cookie expired would be its own bug. */}
      {session.expired && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-expired-title"
          data-testid="session-expired"
        >
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
            <h2 id="session-expired-title" className="text-lg font-bold text-slate-900">
              {t('admin.sessionEnded')}
            </h2>
            <p className="mt-1 mb-5 text-sm text-slate-600">
              {t('admin.sessionEndedLead')}
            </p>

            <LoginForm submitLabel={t('admin.signInAndContinue')} />
          </div>
        </div>
      )}
    </div>
  )
}
