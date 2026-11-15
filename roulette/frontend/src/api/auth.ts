import { ApiUnauthorizedError, apiGet, apiPost, type RequestOptions } from './client'

export interface SessionUser {
  id: number
  username: string
}

/**
 * Who is signed in, or null when nobody is (F07 R15).
 *
 * A 401 here is an answer, not a failure: it is how the page learns to show
 * the login form. Anything else is a real error and is allowed to throw.
 */
export async function fetchSession(options?: RequestOptions): Promise<SessionUser | null> {
  try {
    return await apiGet<SessionUser>('/me', options)
  } catch (error) {
    if (error instanceof ApiUnauthorizedError) {
      return null
    }

    throw error
  }
}

export async function signIn(
  username: string,
  password: string,
  options?: RequestOptions,
): Promise<SessionUser> {
  return apiPost<SessionUser>('/login', { username, password }, options)
}

export async function signOut(options?: RequestOptions): Promise<void> {
  await apiPost<null>('/logout', undefined, options)
}
