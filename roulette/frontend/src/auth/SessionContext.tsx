import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { onUnauthorized } from '../api/client'
import { fetchSession, signOut as signOutRequest, type SessionUser } from '../api/auth'

type Phase = 'checking' | 'signed-in' | 'signed-out'

interface Session {
  phase: Phase
  user: SessionUser | null
  /**
   * True when a request came back 401 while we believed we were signed in —
   * the session ended underneath the admin (F07 R25). Distinct from being
   * plainly signed out, because the admin may have unsaved work on screen.
   */
  expired: boolean
  signedIn: (user: SessionUser) => void
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const SessionContext = createContext<Session | null>(null)

/**
 * Who is signed in, for the whole app (F07).
 *
 * The admin asks this before rendering, so a signed-out visitor sees the
 * login page rather than a screen full of failed requests — which is what
 * they saw the moment the API was closed and nothing in the SPA knew.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>('checking')
  const [user, setUser] = useState<SessionUser | null>(null)
  const [expired, setExpired] = useState(false)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const current = await fetchSession({ signal })

      if (signal?.aborted === true) {
        return
      }

      setUser(current)
      setPhase(current === null ? 'signed-out' : 'signed-in')
      setExpired(false)
    } catch {
      if (signal?.aborted !== true) {
        // The server is unreachable rather than refusing us. Treat it as
        // signed out: the admin cannot work either way, and claiming a
        // session we cannot confirm would be worse.
        setUser(null)
        setPhase('signed-out')
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    void refresh(controller.signal)

    return () => controller.abort()
  }, [refresh])

  // The listener below is registered once and would otherwise close over
  // the phase as it was at mount.
  const phaseRef = useRef<Phase>(phase)
  phaseRef.current = phase

  /**
   * F07 R25. Deliberately does *not* move to signed-out.
   *
   * Doing that redirects away from the admin and throws away whatever was
   * half-edited on screen — which is the thing this rule exists to prevent.
   * The session is marked expired instead, the admin stays mounted, and a
   * prompt goes over the top of it.
   *
   * Guarded on being signed in, because a 401 is also the ordinary answer
   * when checking a session that does not exist, and that must not look
   * like an expiry.
   */
  useEffect(
    () =>
      onUnauthorized(() => {
        if (phaseRef.current === 'signed-in') {
          setExpired(true)
        }
      }),
    [],
  )

  const value = useMemo<Session>(
    () => ({
      phase,
      user,
      expired,
      signedIn: (signedInUser) => {
        setUser(signedInUser)
        setPhase('signed-in')
        setExpired(false)
      },
      signOut: async () => {
        try {
          await signOutRequest()
        } catch {
          // Swallowed, not re-thrown. `finally` alone used to clear the
          // state and then let the rejection carry on out of here, and the
          // caller is a click handler with nowhere to put it — so signing
          // out while offline worked on screen and left an unhandled
          // rejection behind it. There is nothing for a caller to do about a
          // sign-out that already succeeded locally.
        } finally {
          // Signed out locally whatever the server said: a failed sign-out
          // that leaves the admin looking signed in is the worse outcome.
          setUser(null)
          setPhase('signed-out')
          setExpired(false)
        }
      },
      refresh: () => refresh(),
    }),
    [phase, user, expired, refresh],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): Session {
  const session = useContext(SessionContext)

  if (session === null) {
    throw new Error('useSession must be used inside a SessionProvider.')
  }

  return session
}
