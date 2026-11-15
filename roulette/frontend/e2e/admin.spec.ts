import { expect, test, type Page } from '@playwright/test'
import { signIn } from './auth'

/**
 * F01 in a real browser, against the real API and a real database.
 *
 * Most of these only read. The ones that save are confined to a single
 * project and run in order, because they share one database and a parallel
 * writer would make them flap.
 */

const DEFAULT_PRIZES = [
  ['Try again', '40'],
  ['5% off your next order', '25'],
  ['10% off your next order', '15'],
  ['Free sample', '10'],
  ['Free gift', '7'],
  ['Grand prize', '3'],
] as const

function nameField(page: Page, index: number) {
  return page.getByTestId('prize-row').nth(index).getByLabel(/name$/i)
}

function probabilityField(page: Page, index: number) {
  return page.getByTestId('prize-row').nth(index).getByLabel(/percentage$/i)
}

/**
 * F07 R17: every /api/admin route needs a session now.
 *
 * Both contexts are signed in because these specs use both: `page` for the
 * admin screens and the standalone `request` fixture for the API checks and
 * the clean-up, and Playwright keeps their cookies apart.
 */
test.beforeEach(async ({ page, request }) => {
  await signIn(page.request)
  await signIn(request)
})

test.describe('the admin wheel page', () => {
  test.beforeEach(async ({ page }) => {
    // `/admin` rather than `/admin/game`, deliberately: F09 R3 says the old
    // URL still opens the Game module, and this is the spec that proves the
    // redirect works in a real browser.
    await page.goto('/admin')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Game')
    await expect(page.getByTestId('prize-row').first()).toBeVisible()
  })

  /** F01 R2 */
  test('creates and shows the default wheel', async ({ page }) => {
    await expect(page.getByTestId('prize-row')).toHaveCount(DEFAULT_PRIZES.length)

    for (const [index, [name, probability]] of DEFAULT_PRIZES.entries()) {
      await expect(nameField(page, index)).toHaveValue(name)
      await expect(probabilityField(page, index)).toHaveValue(probability)
    }

    await expect(page.getByTestId('probability-total')).toHaveAttribute('data-valid', 'true')
  })

  /** F01 R13 */
  test('draws one equal slice per prize', async ({ page }) => {
    const slices = page.getByTestId('wheel-slice')
    await expect(slices).toHaveCount(DEFAULT_PRIZES.length)

    // Identical wedges rotated about the centre have identical path
    // lengths. Their bounding boxes do not, which is why this measures the
    // outline rather than the box around it.
    const lengths = await page
      .locator('[data-testid="wheel-slice"] path')
      .evaluateAll((paths) => paths.map((path) => (path as SVGPathElement).getTotalLength()))

    const spread = Math.max(...lengths) - Math.min(...lengths)

    expect(spread).toBeLessThan(0.5)
    expect(Math.min(...lengths)).toBeGreaterThan(0)
  })

  /** F01 R14 — the frontend palette must agree with the backend's */
  test('colours the slices exactly as the API says', async ({ page, request }) => {
    const configuration = await (await request.get('/api/admin/wheel')).json()

    const rendered = await page
      .getByTestId('wheel-slice')
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.colour))

    expect(rendered).toEqual(
      configuration.prizes.map((prize: { colour: string }) => prize.colour),
    )
  })

  /** F01 R18 */
  test('redraws the preview as a name is typed, before saving', async ({ page }) => {
    await nameField(page, 0).fill('Nearly there')

    await expect(
      page.locator('[data-testid="wheel-slice"] tspan', { hasText: 'Nearly there' }).first(),
    ).toBeVisible()
  })

  /** F01 R17, R9 */
  test('marks the total invalid and disables saving when it is not 100', async ({ page }) => {
    await probabilityField(page, 0).fill('37')

    const total = page.getByTestId('probability-total')
    await expect(total).toHaveAttribute('data-valid', 'false')
    await expect(total).toContainText('97')
    await expect(page.getByRole('button', { name: /^save$/i })).toBeDisabled()
  })

  /** F01 R4 */
  test('refuses a blank name', async ({ page }) => {
    await nameField(page, 0).fill('')

    await expect(page.getByText('A prize needs a name.')).toBeVisible()
    await expect(page.getByRole('button', { name: /^save$/i })).toBeDisabled()
  })

  /** F01 R20 */
  test('disables removing when only two prizes would remain', async ({ page }) => {
    const remove = page.getByRole('button', { name: /^remove/i })

    // Six by default, so removal is available now.
    await expect(remove.first()).toBeEnabled()

    // Waiting for each removal before the next: the controls shift upward as
    // rows disappear, and clicking again before the page settles can land on
    // a button that has already moved.
    for (let remaining = 5; remaining >= 2; remaining -= 1) {
      await remove.first().click()
      await expect(page.getByTestId('prize-row')).toHaveCount(remaining)
    }

    await expect(remove.first()).toBeDisabled()
  })

  /** F01 R19 */
  test('disables adding at twelve prizes', async ({ page }) => {
    const add = page.getByRole('button', { name: /add prize/i })

    // Each new row pushes this button further down the page, so settle
    // after every click rather than firing six at a moving target.
    for (let count = 7; count <= 12; count += 1) {
      await add.click()
      await expect(page.getByTestId('prize-row')).toHaveCount(count)
    }

    await expect(add).toBeDisabled()
  })

  /** F01 R16 */
  test('renders a name containing markup as text', async ({ page }) => {
    await nameField(page, 0).fill('<b>bold</b>')

    await expect(page.locator('[data-testid="wheel-slice"] b')).toHaveCount(0)
    await expect(
      page.locator('[data-testid="wheel-slice"] tspan', { hasText: '<b>bold' }).first(),
    ).toBeVisible()
  })

  test('fits the viewport with no horizontal scroll', async ({ page }) => {
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))

    expect(
      scrollWidth,
      `The admin page scrolls sideways: ${scrollWidth}px of content in a ${clientWidth}px viewport.`,
    ).toBeLessThanOrEqual(clientWidth)
  })
})

/**
 * These write to the database. One project only, and in order, so two
 * browsers never save over each other.
 */
test.describe('saving', () => {
  test.describe.configure({ mode: 'serial' })

  test.afterEach(async ({ request }) => {
    // Put the wheel back so the read-only tests always find the default.
    await request.put('/api/admin/wheel', {
      data: {
        prizes: DEFAULT_PRIZES.map(([name, probability]) => ({
          name,
          probability: Number(probability),
        })),
      },
    })
  })

  test('persists a renamed prize across a reload', async ({ page }) => {
    await page.goto('/admin')
    await nameField(page, 0).fill('Better luck next time')

    await page.getByRole('button', { name: /^save$/i }).click()
    await expect(page.getByText('Saved')).toBeVisible()

    await page.reload()
    await expect(nameField(page, 0)).toHaveValue('Better luck next time')
  })

  /** F01 R7 — order survives, and the reorder clears the unique constraint */
  test('persists a reorder', async ({ page }) => {
    await page.goto('/admin')

    const firstName = await nameField(page, 0).inputValue()
    const secondName = await nameField(page, 1).inputValue()

    await page.getByRole('button', { name: /move .* down/i }).first().click()
    await page.getByRole('button', { name: /^save$/i }).click()
    await expect(page.getByText('Saved')).toBeVisible()

    await page.reload()
    await expect(nameField(page, 0)).toHaveValue(secondName)
    await expect(nameField(page, 1)).toHaveValue(firstName)
  })

  test('persists a removed prize', async ({ page }) => {
    await page.goto('/admin')

    await page.getByRole('button', { name: /^remove/i }).first().click()
    // Put the freed percentage back so the total is 100 again.
    await probabilityField(page, 0).fill('65')

    await page.getByRole('button', { name: /^save$/i }).click()
    await expect(page.getByText('Saved')).toBeVisible()

    await page.reload()
    await expect(page.getByTestId('prize-row')).toHaveCount(5)
  })
})

/** The API contract from F01 section 8. */
test.describe('the wheel API', () => {
  test('rejects a total that is not 100 with a field-level 422', async ({ request }) => {
    const response = await request.put('/api/admin/wheel', {
      data: {
        prizes: [
          { name: 'A', probability: 60 },
          { name: 'B', probability: 37 },
        ],
      },
    })

    expect(response.status()).toBe(422)

    const body = await response.json()
    expect(body.error.violations[0].field).toBe('prizes')
    expect(body.error.violations[0].message).toContain('97')
  })

  test('leaves the stored wheel untouched when a save is rejected', async ({ request }) => {
    const before = await (await request.get('/api/admin/wheel')).json()

    await request.put('/api/admin/wheel', {
      data: { prizes: [{ name: 'Only one', probability: 100 }] },
    })

    const after = await (await request.get('/api/admin/wheel')).json()
    expect(after.prizes).toEqual(before.prizes)
  })
})
