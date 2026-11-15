import { expect, test } from '@playwright/test'
import { E2E_DATABASE } from './env'

/**
 * The API contract, requested through the same proxy the browser uses. If the
 * proxy breaks, these fail alongside the page tests and the cause is obvious.
 */

test.describe('GET /api/health', () => {
  test('answers 200 with JSON', async ({ request }) => {
    const response = await request.get('/api/health')

    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('application/json')
  })

  test('carries the documented keys', async ({ request }) => {
    const body = await (await request.get('/api/health')).json()

    expect(body).toMatchObject({
      status: 'ok',
      app: 'roulette',
    })
    expect(body).toHaveProperty('env')
    expect(body).toHaveProperty('time')
  })

  test('reports a parseable, current timestamp', async ({ request }) => {
    const { time } = await (await request.get('/api/health')).json()

    const parsed = Date.parse(time)
    expect(Number.isNaN(parsed)).toBe(false)
    expect(Math.abs(parsed - Date.now())).toBeLessThan(60_000)
  })
})

/**
 * The suite must run against its own database. It once did not: the
 * DATABASE_URL override never reached PHP, and every end-to-end spin was
 * written to the development database instead. This asserts the isolation
 * directly rather than trusting the configuration.
 */
test.describe('test isolation', () => {
  test('the API under test is wired to the end-to-end database', async ({ request }) => {
    const health = await (await request.get('/api/health')).json()

    expect(
      health.database,
      'The end-to-end suite is pointed at the wrong database.',
    ).toBe(E2E_DATABASE)
  })
})

test.describe('API error responses', () => {
  test('an unknown path is a JSON 404, not an HTML page', async ({ request }) => {
    const response = await request.get('/api/definitely-not-a-route')

    expect(response.status()).toBe(404)
    expect(response.headers()['content-type']).toContain('application/json')
    expect(await response.json()).toHaveProperty('error.status', 404)
  })

  test('a wrong method is a JSON 405', async ({ request }) => {
    const response = await request.post('/api/health')

    expect(response.status()).toBe(405)
    expect(response.headers()['content-type']).toContain('application/json')
    expect(await response.json()).toHaveProperty('error.status', 405)
  })
})
