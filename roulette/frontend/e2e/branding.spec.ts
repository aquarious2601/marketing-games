import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { signIn } from './auth'

/**
 * F04 in a real browser.
 *
 * Everything here writes to the shared branding record, so each test puts it
 * back afterwards. Without that, a campaign name left behind would break the
 * player spec's assertion that the heading reads "Spin to win".
 */

/** A real 1×1 PNG. No GD needed, and no fixture file to keep in step. */
const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const THEME_BACKGROUNDS: Record<string, string> = {
  plain: 'rgb(248, 250, 252)',
  'black-friday': 'rgb(11, 11, 12)',
  christmas: 'rgb(11, 61, 46)',
  'new-year': 'rgb(11, 20, 55)',
  halloween: 'rgb(26, 11, 46)',
  birthday: 'rgb(253, 242, 248)',
}

function pngUpload(name = 'logo.png') {
  return { name, mimeType: 'image/png', buffer: Buffer.from(ONE_PIXEL_PNG, 'base64') }
}

async function resetBranding(request: APIRequestContext) {
  await request.delete('/api/admin/branding/logo')
  await request.put('/api/admin/branding', {
    data: { companyName: '', campaignName: '', theme: 'plain' },
  })
}

async function openAdmin(page: Page) {
  await page.goto('/admin')
  await expect(page.getByTestId('branding-section')).toBeVisible()
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

test.afterEach(async ({ request }) => {
  await resetBranding(request)
})

test.describe('configuring the branding', () => {
  test('shows every theme', async ({ page }) => {
    await openAdmin(page)

    const labels = await page
      .getByLabel('Theme', { exact: true })
      .locator('option')
      .allTextContents()

    expect(labels).toEqual([
      'Plain',
      'Black Friday',
      'Christmas',
      'New Year',
      'Halloween',
      'Happy Birthday',
    ])
  })

  test('saves the names and theme, and the player sees them', async ({ page }) => {
    await openAdmin(page)

    await page.getByLabel('Company name').fill('AA Store')
    await page.getByLabel('Campaign name').fill('Black Friday Giveaway')
    await page.getByLabel('Theme', { exact: true }).selectOption('black-friday')
    await page.getByTestId('save-branding').click()

    await expect(page.getByText('Saved')).toBeVisible()

    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Black Friday Giveaway')
    await expect(page.getByTestId('player-company')).toHaveText('AA Store')
    await expect(page.getByTestId('player-screen')).toHaveAttribute('data-theme', 'black-friday')
  })

  /** F04 R5 — the two saves are independent */
  test('saving branding leaves the prizes alone', async ({ page }) => {
    await openAdmin(page)
    const before = await page.getByTestId('prize-row').count()

    await page.getByLabel('Company name').fill('AA Store')
    await page.getByTestId('save-branding').click()
    await expect(page.getByText('Saved')).toBeVisible()

    await page.reload()
    await expect(page.getByTestId('prize-row')).toHaveCount(before)
  })

  /** F04 R27 — the admin is never dressed up */
  test('leaves the admin page unthemed', async ({ page, request }) => {
    await request.put('/api/admin/branding', {
      data: { companyName: 'AA Store', campaignName: 'Noel', theme: 'halloween' },
    })

    await openAdmin(page)

    await expect(page.getByTestId('player-screen')).toHaveCount(0)
    // F09: the module's name is the h1 now; "Wheel prizes" is a section
    // heading within it.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Game')
  })
})

test.describe('the themes on the player page', () => {
  for (const [theme, background] of Object.entries(THEME_BACKGROUNDS)) {
    test(`paints the page for ${theme}`, async ({ page, request }) => {
      await request.put('/api/admin/branding', {
        data: { companyName: '', campaignName: '', theme },
      })

      await page.goto('/')
      await expect(page.getByTestId('wheel-preview')).toBeVisible()

      const painted = await page
        .getByTestId('player-screen')
        .evaluate((node) => getComputedStyle(node).backgroundColor)

      expect(painted).toBe(background)
    })
  }

  /** F04 R10 — the wheel never changes */
  test('leaves the slice colours identical across themes', async ({ page, request }) => {
    const colours: Record<string, (string | undefined)[]> = {}

    for (const theme of ['plain', 'halloween']) {
      await request.put('/api/admin/branding', {
        data: { companyName: '', campaignName: '', theme },
      })

      await page.goto('/')
      await expect(page.getByTestId('wheel-preview')).toBeVisible()

      colours[theme] = await page
        .getByTestId('wheel-slice')
        .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.colour))
    }

    expect(colours.halloween).toEqual(colours.plain)
  })
})

test.describe('the logo', () => {
  test('uploads, shows on the player page, then removes', async ({ page }) => {
    await openAdmin(page)

    await page.getByLabel('Logo', { exact: true }).setInputFiles(pngUpload())
    await expect(page.getByTestId('current-logo')).toBeVisible()

    await page.goto('/')
    const logo = page.getByTestId('player-logo')
    await expect(logo).toBeVisible()

    // Actually fetched, not just an <img> pointing at a 404.
    const src = await logo.getAttribute('src')
    const response = await page.request.get(src ?? '')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('image/png')
    expect(response.headers()['x-content-type-options']).toBe('nosniff')

    await openAdmin(page)
    // Scoped: every prize row has a "Remove <prize>" button too.
    await page
      .getByTestId('branding-section')
      .getByRole('button', { name: 'Remove', exact: true })
      .click()
    await expect(page.getByTestId('current-logo')).toHaveCount(0)

    await page.goto('/')
    await expect(page.getByTestId('player-logo')).toHaveCount(0)
  })

  /** F04 R14 */
  test('refuses an SVG and says why', async ({ page }) => {
    await openAdmin(page)

    await page.getByLabel('Logo', { exact: true }).setInputFiles({
      name: 'logo.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    })

    await expect(page.getByRole('alert')).toContainText(/SVG is not accepted/i)
    await expect(page.getByTestId('current-logo')).toHaveCount(0)
  })

  /** F04 R16 */
  test('refuses a text file renamed to .png', async ({ page }) => {
    await openAdmin(page)

    await page.getByLabel('Logo', { exact: true }).setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: Buffer.from('not an image at all'),
    })

    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByTestId('current-logo')).toHaveCount(0)
  })
})

test.describe('the branding API', () => {
  /** F04 R12 */
  test('rejects an unknown theme', async ({ request }) => {
    const response = await request.put('/api/admin/branding', {
      data: { companyName: '', campaignName: '', theme: 'easter' },
    })

    expect(response.status()).toBe(422)
    expect((await response.json()).error.violations[0].field).toBe('theme')
  })

  test('rejects a name over sixty characters', async ({ request }) => {
    const response = await request.put('/api/admin/branding', {
      data: { companyName: 'a'.repeat(61), campaignName: '', theme: 'plain' },
    })

    expect(response.status()).toBe(422)
  })

  test('serves no logo when none is set', async ({ request }) => {
    const response = await request.get('/api/branding/logo')

    expect(response.status()).toBe(404)
  })
})
