import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchSession, signIn, signOut } from '../api/auth'
import { ApiError, ApiUnauthorizedError, apiGet } from '../api/client'
import { AdminShell } from './AdminShell'
import { LoginPage } from './LoginPage'
import { RequireSession } from './RequireSession'
import { SessionProvider } from './SessionContext'

vi.mock('../api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/auth')>()),
  fetchSession: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}))

const fetchSessionMock = vi.mocked(fetchSession)
const signInMock = vi.mocked(signIn)
const signOutMock = vi.mocked(signOut)

const USER = { id: 1, username: 'tester' }

beforeEach(() => {
  fetchSessionMock.mockReset()
  signInMock.mockReset()
  signOutMock.mockReset()
  fetchSessionMock.mockResolvedValue(null)
  signOutMock.mockResolvedValue(undefined)
})

function renderApp(initialPath = '/admin') {
  const user = userEvent.setup()

  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SessionProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/admin"
            element={
              <RequireSession>
                <AdminShell>
                  <p>The admin</p>
                </AdminShell>
              </RequireSession>
            }
          />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  )

  return user
}

describe('reaching the admin', () => {
  /** F07 R22 */
  it('sends a signed-out visitor to the login page', async () => {
    renderApp('/admin')

    expect(await screen.findByTestId('login-form')).toBeInTheDocument()
    expect(screen.queryByText('The admin')).not.toBeInTheDocument()
  })

  it('lets a signed-in visitor straight through', async () => {
    fetchSessionMock.mockResolvedValue(USER)

    renderApp('/admin')

    expect(await screen.findByText('The admin')).toBeInTheDocument()
    expect(screen.queryByTestId('login-form')).not.toBeInTheDocument()
  })

  /**
   * Otherwise the login page flashes in front of someone who is signed in,
   * on every page load, while the session is still being confirmed.
   */
  it('shows neither while the session is still being checked', () => {
    fetchSessionMock.mockReturnValue(new Promise(() => {}))

    renderApp('/admin')

    expect(screen.getByRole('status')).toHaveTextContent(/checking/i)
    expect(screen.queryByTestId('login-form')).not.toBeInTheDocument()
    expect(screen.queryByText('The admin')).not.toBeInTheDocument()
  })

  it('treats an unreachable server as signed out rather than signed in', async () => {
    fetchSessionMock.mockRejectedValue(new ApiError('offline', 500))

    renderApp('/admin')

    expect(await screen.findByTestId('login-form')).toBeInTheDocument()
  })
})

describe('signing in', () => {
  /** F07 R21, R22 */
  it('signs in and lands on the admin', async () => {
    signInMock.mockResolvedValue(USER)
    const user = renderApp('/admin')

    await screen.findByTestId('login-form')

    await user.type(screen.getByLabelText(/username/i), 'tester')
    await user.type(screen.getByLabelText(/password/i), 'a-password-long-enough')
    await user.click(screen.getByTestId('login-submit'))

    expect(await screen.findByText('The admin')).toBeInTheDocument()
    expect(signInMock).toHaveBeenCalledWith('tester', 'a-password-long-enough')
  })

  it('trims the username', async () => {
    signInMock.mockResolvedValue(USER)
    const user = renderApp('/admin')
    await screen.findByTestId('login-form')

    await user.type(screen.getByLabelText(/username/i), '  tester  ')
    await user.type(screen.getByLabelText(/password/i), 'a-password-long-enough')
    await user.click(screen.getByTestId('login-submit'))

    await waitFor(() => expect(signInMock).toHaveBeenCalledWith('tester', 'a-password-long-enough'))
  })

  /** F07 R12 — the message must not reveal which half was wrong */
  it('says the same thing whatever was wrong', async () => {
    signInMock.mockRejectedValue(new ApiUnauthorizedError('Unauthorized'))
    const user = renderApp('/admin')
    await screen.findByTestId('login-form')

    await user.type(screen.getByLabelText(/username/i), 'tester')
    await user.type(screen.getByLabelText(/password/i), 'wrong-password-here')
    await user.click(screen.getByTestId('login-submit'))

    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'That username or password is not right.',
    )
  })

  /** F07 R13 */
  it('explains a throttled login', async () => {
    signInMock.mockRejectedValue(new ApiError('Too many', 429))
    const user = renderApp('/admin')
    await screen.findByTestId('login-form')

    await user.type(screen.getByLabelText(/username/i), 'tester')
    await user.type(screen.getByLabelText(/password/i), 'wrong-password-here')
    await user.click(screen.getByTestId('login-submit'))

    expect(await screen.findByTestId('login-error')).toHaveTextContent(/too many attempts/i)
  })

  it('clears the password after a failure', async () => {
    signInMock.mockRejectedValue(new ApiUnauthorizedError('Unauthorized'))
    const user = renderApp('/admin')
    await screen.findByTestId('login-form')

    await user.type(screen.getByLabelText(/username/i), 'tester')
    await user.type(screen.getByLabelText(/password/i), 'wrong-password-here')
    await user.click(screen.getByTestId('login-submit'))

    await screen.findByTestId('login-error')
    expect(screen.getByLabelText(/password/i)).toHaveValue('')
    expect(screen.getByLabelText(/username/i)).toHaveValue('tester')
  })

  it('does not call the server with an empty field', async () => {
    const user = renderApp('/admin')
    await screen.findByTestId('login-form')

    await user.click(screen.getByTestId('login-submit'))

    expect(await screen.findByTestId('login-error')).toHaveTextContent(/enter your username/i)
    expect(signInMock).not.toHaveBeenCalled()
  })

  it('uses a password field, so it is not shown or autofilled as text', async () => {
    renderApp('/admin')
    await screen.findByTestId('login-form')

    expect(screen.getByLabelText(/password/i)).toHaveAttribute('type', 'password')
  })
})

describe('inside the admin', () => {
  /** F07 R23 */
  it('shows who is signed in, and a way out', async () => {
    fetchSessionMock.mockResolvedValue(USER)

    renderApp('/admin')

    expect(await screen.findByTestId('signed-in-as')).toHaveTextContent('tester')
    expect(screen.getByTestId('sign-out')).toBeInTheDocument()
  })

  /** F07 R14 */
  it('signing out returns to the login page', async () => {
    fetchSessionMock.mockResolvedValue(USER)
    const user = renderApp('/admin')

    await screen.findByText('The admin')
    await user.click(screen.getByTestId('sign-out'))

    expect(await screen.findByTestId('login-form')).toBeInTheDocument()
    expect(signOutMock).toHaveBeenCalledOnce()
  })

  it('signs out locally even when the server call fails', async () => {
    fetchSessionMock.mockResolvedValue(USER)
    signOutMock.mockRejectedValue(new ApiError('offline', 500))
    const user = renderApp('/admin')

    await screen.findByText('The admin')
    await user.click(screen.getByTestId('sign-out'))

    // Looking signed in while signed out is the worse of the two failures.
    expect(await screen.findByTestId('login-form')).toBeInTheDocument()
  })
})

describe('when the session ends mid-edit', () => {
  /**
   * F07 R25. A redirect would be simpler and would throw away a half-edited
   * prize list, so this asserts the admin is still on screen behind it.
   */
  it('prompts to sign in again without discarding the page', async () => {
    fetchSessionMock.mockResolvedValue(USER)

    renderApp('/admin')
    await screen.findByText('The admin')

    // Something the admin did came back 401.
    await sessionEndsUnderneath()

    expect(await screen.findByTestId('session-expired')).toBeInTheDocument()
    expect(screen.getByText('The admin')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
  })

  it('carries on in place once signed in again', async () => {
    fetchSessionMock.mockResolvedValue(USER)
    signInMock.mockResolvedValue(USER)
    const user = renderApp('/admin')

    await screen.findByText('The admin')
    await sessionEndsUnderneath()
    await screen.findByTestId('session-expired')

    await user.type(screen.getByLabelText(/username/i), 'tester')
    await user.type(screen.getByLabelText(/password/i), 'a-password-long-enough')
    await user.click(screen.getByTestId('login-submit'))

    await waitFor(() => expect(screen.queryByTestId('session-expired')).not.toBeInTheDocument())
    expect(screen.getByText('The admin')).toBeInTheDocument()
  })
})

/**
 * Fires the client's 401 broadcast the way a real request would.
 *
 * Calling the listeners directly would test nothing: the behaviour under
 * test is that a 401 *from any request* reaches the session, so this goes
 * through the client's own error path.
 */
async function sessionEndsUnderneath(): Promise<void> {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        ({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: async () => ({ error: { status: 401, message: 'You need to sign in.' } }),
        }) as unknown as Response,
    ),
  )

  await apiGet('/admin/wheel').catch(() => undefined)
}
