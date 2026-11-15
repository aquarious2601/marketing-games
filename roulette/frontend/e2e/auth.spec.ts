import { expect, test } from '@playwright/test'
import { E2E_ADMIN, signIn } from './auth'
import { identifyPlayer } from './player'

/**
 * F07 in a real browser, from the outside.
 *
 * This file deliberately does not sign in at the top, unlike the other admin
 * specs: the whole point is what a stranger gets.
 */

const ADMIN_ROUTES = [
  { method: 'GET', path: '/api/admin/wheel' },
  { method: 'PUT', path: '/api/admin/wheel' },
  { method: 'GET', path: '/api/admin/branding' },
  { method: 'PUT', path: '/api/admin/branding' },
  { method: 'POST', path: '/api/admin/branding/logo' },
  { method: 'DELETE', path: '/api/admin/branding/logo' },
] as const

test.describe('a stranger', () => {
  /** F07 R17, R18 */
  for (const { method, path } of ADMIN_ROUTES) {
    test(`cannot ${method} ${path}`, async ({ request }) => {
      const response = await request.fetch(path, { method })

      expect(response.status()).toBe(401)
      expect(response.headers()['content-type']).toContain('application/json')
    })
  }

  /**
   * F07 R19 — the game is still for the public.
   *
   * F08 R16 added the one condition: a stranger with no admin account still
   * spins, once they have said who they are. The 403 before identifying is
   * the game asking, not the firewall refusing.
   */
  test('can still load the wheel and spin', async ({ request }) => {
    expect((await request.get('/api/wheel')).status()).toBe(200)
    expect((await request.post('/api/spin')).status()).toBe(403)

    await identifyPlayer(request)

    expect((await request.post('/api/spin')).status()).toBe(200)
    expect((await request.get('/api/health')).status()).toBe(200)
  })

  test('can still play the game in a browser', async ({ page }) => {
    await identifyPlayer(page.request)
    await page.goto('/')

    await expect(page.getByTestId('wheel-preview')).toBeVisible()
    await expect(page.getByTestId('spin-button')).toBeEnabled()
  })

  /** F07 R15 */
  test('is nobody according to /api/me', async ({ request }) => {
    expect((await request.get('/api/me')).status()).toBe(401)
  })

  /** F07 R12 — the two failures must be indistinguishable */
  test('cannot tell a wrong password from a missing account', async ({ request }) => {
    const wrongPassword = await request.post('/api/login', {
      data: { username: E2E_ADMIN.username, password: 'not-the-right-password' },
    })
    const unknownUser = await request.post('/api/login', {
      data: { username: 'nobody-at-all', password: 'not-the-right-password' },
    })

    expect(wrongPassword.status()).toBe(unknownUser.status())
    expect(await wrongPassword.text()).toBe(await unknownUser.text())
    expect(wrongPassword.status()).toBe(401)
  })
})

test.describe('once signed in', () => {
  /** F07 R10, R17 */
  test('the admin API opens up', async ({ request }) => {
    await signIn(request)

    expect((await request.get('/api/admin/wheel')).status()).toBe(200)
    expect((await request.get('/api/admin/branding')).status()).toBe(200)
  })

  /** F07 R15 */
  test('the session reports who it belongs to', async ({ request }) => {
    await signIn(request)

    const me = await (await request.get('/api/me')).json()

    expect(me.username).toBe(E2E_ADMIN.username)
    expect(me).not.toHaveProperty('password')
  })

  /** F07 R11 */
  test('the session cookie is httpOnly', async ({ context, request }) => {
    await signIn(request)

    // The standalone request fixture keeps its own jar; read it through the
    // storage state rather than the browser context.
    const state = await request.storageState()
    const session = state.cookies.find((cookie) => /sess/i.test(cookie.name))

    expect(session, 'Signing in should set a session cookie.').toBeDefined()
    expect(session?.httpOnly).toBe(true)
    expect(context).toBeDefined()
  })

  /** F07 R14 */
  test('signing out closes the admin again', async ({ request }) => {
    await signIn(request)
    expect((await request.get('/api/admin/wheel')).status()).toBe(200)

    const loggedOut = await request.post('/api/logout')
    expect(loggedOut.status()).toBe(204)

    expect((await request.get('/api/me')).status()).toBe(401)
    expect((await request.get('/api/admin/wheel')).status()).toBe(401)
  })
})
