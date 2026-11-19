import { useState } from 'react'
import { signIn } from '../api/auth'
import { ApiUnauthorizedError, type ApiError } from '../api/client'
import { useT, type Translate } from '../i18n/I18nContext'
import { useSession } from './SessionContext'

interface LoginFormProps {
  /** Called once the credentials were accepted. */
  onSignedIn?: () => void
  submitLabel?: string
}

/**
 * The sign-in form, shared by the login page and the session-expired prompt
 * so both behave identically (F07 R21, R25).
 */
export function LoginForm({ onSignedIn, submitLabel }: LoginFormProps) {
  const session = useSession()
  const t = useT()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (username.trim() === '' || password === '') {
      setError(t('login.bothRequired'))

      return
    }

    setBusy(true)
    setError(null)

    try {
      const user = await signIn(username.trim(), password)

      setPassword('')
      session.signedIn(user)
      onSignedIn?.()
    } catch (caught) {
      setError(messageFor(caught, t))
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-4" data-testid="login-form">
      <div>
        <label htmlFor="username" className={labelClass}>
          {t('login.username')}
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          autoFocus
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="password" className={labelClass}>
          {t('login.password')}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClass}
        />
      </div>

      {error !== null && (
        <p role="alert" data-testid="login-error" className="text-sm text-rose-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        data-testid="login-submit"
        className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? t('login.signingIn') : (submitLabel ?? t('login.submit'))}
      </button>
    </form>
  )
}

/**
 * F07 R12: the same message whichever half was wrong, because the page must
 * not become a way of finding out who has an account.
 */
function messageFor(error: unknown, t: Translate): string {
  if (error instanceof ApiUnauthorizedError) {
    return t('login.badCredentials')
  }

  // F07 R13: the server throttles repeated failures.
  if (isApiError(error) && error.status === 429) {
    return t('login.throttled')
  }

  return t('login.failed')
}

function isApiError(error: unknown): error is ApiError {
  return typeof error === 'object' && error !== null && 'status' in error
}

const labelClass = 'block text-xs font-medium text-slate-600'
const inputClass =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500'
