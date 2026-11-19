import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { signIn } from './auth'
import { identifyPlayer } from './player'
import { theGame } from './wheel'

/**
 * F04 in a real browser, as F27 and F30 left it.
 *
 * The shop's identity and the promotion's look are now two records: the
 * company name and the logo are the store's, and the name, the phrase and
 * the theme are the game's. Everything here writes to one of them, so each
 * test puts both back afterwards — without that, a name left behind would
 * break the player spec's assertion about the heading.
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

/** What the player spec expects to find, and therefore what to restore to. */
const DEFAULT_GAME_NAME = 'Spin to win'

function pngUpload(name = 'logo.png') {
  return { name, mimeType: 'image/png', buffer: Buffer.from(ONE_PIXEL_PNG, 'base64') }
}

/** F30 R1: the theme is the game's, so putting it back means saving a game. */
async function setGame(
  request: APIRequestContext,
  fields: { name?: string; theme?: string },
): Promise<void> {
  const game = await theGame(request)

  await request.put(`/api/admin/games/${game.id}`, {
    data: { name: fields.name ?? DEFAULT_GAME_NAME, theme: fields.theme ?? 'plain' },
  })
}

async function resetBranding(request: APIRequestContext) {
  await request.delete('/api/admin/branding/logo')
  await request.put('/api/admin/store', { data: { companyName: '' } })
  await setGame(request, {})
}

async function openStore(page: Page) {
  await page.goto('/admin/store')
  await expect(page.getByTestId('store-section')).toBeVisible()
}

async function openGame(page: Page, request: APIRequestContext) {
  await page.goto(`/admin/games/${(await theGame(request)).id}`)
  await expect(page.getByTestId('game-settings')).toBeVisible()
}

/** F27 R20: a game is played at its own link. */
async function openPlayerPage(page: Page, request: APIRequestContext) {
  await page.goto(`/play/${(await theGame(request)).linkKey}`)
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
  /** F04 R7, F30 R14 — the picker is the game's now */
  test('shows every theme', async ({ page, request }) => {
    await openGame(page, request)

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

  /** F30 R15 — and it is no longer the store's */
  test('offers no theme on the store', async ({ page }) => {
    await openStore(page)

    await expect(page.getByLabel('Theme', { exact: true })).toHaveCount(0)
  })

  test('saves the company name, and the player sees it', async ({ page, request }) => {
    await openStore(page)

    await page.getByLabel('Company name').fill('AA Store')
    await page.getByTestId('save-store').click()

    await expect(page.getByText('Saved')).toBeVisible()

    await openPlayerPage(page, request)
    await expect(page.getByTestId('player-company')).toHaveText('AA Store')
  })

  test('saves the game name and theme, and the player sees them', async ({ page, request }) => {
    await openGame(page, request)

    await page.getByLabel('Name', { exact: true }).fill('Black Friday Giveaway')
    await page.getByLabel('Theme', { exact: true }).selectOption('black-friday')
    await page.getByTestId('save-game').click()

    await expect(page.getByText('Saved')).toBeVisible()

    await openPlayerPage(page, request)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Black Friday Giveaway')
    await expect(page.getByTestId('player-screen')).toHaveAttribute('data-theme', 'black-friday')
  })

  /** F04 R5, F27 R40 — the two saves are independent */
  test('saving the game leaves the prizes alone', async ({ page, request }) => {
    await openGame(page, request)
    const before = await page.getByTestId('prize-row').count()

    await page.getByLabel('Theme', { exact: true }).selectOption('christmas')
    await page.getByTestId('save-game').click()
    await expect(page.getByText('Saved')).toBeVisible()

    await page.reload()
    await expect(page.getByTestId('prize-row')).toHaveCount(before)
  })

  /** F04 R27 — the admin is never dressed up */
  test('leaves the admin page unthemed', async ({ page, request }) => {
    await request.put('/api/admin/store', { data: { companyName: 'AA Store' } })
    await setGame(request, { name: 'Noel', theme: 'halloween' })

    await openGame(page, request)

    await expect(page.getByTestId('player-screen')).toHaveCount(0)
    // F09: the module's name is the h1 now; "Wheel prizes" is a section
    // heading within it.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Noel')
  })
})

test.describe('the themes on the player page', () => {
  for (const [theme, background] of Object.entries(THEME_BACKGROUNDS)) {
    test(`paints the page for ${theme}`, async ({ page, request }) => {
      await setGame(request, { name: '', theme })

      // F08 R16: nothing past the phone-number step exists until the
      // server knows who is playing, and the themed screen is past it.
      await identifyPlayer(page.request)

      await openPlayerPage(page, request)
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

    // F08 R16, as above.
    await identifyPlayer(page.request)

    for (const theme of ['plain', 'halloween']) {
      await setGame(request, { name: '', theme })

      await openPlayerPage(page, request)
      await expect(page.getByTestId('wheel-preview')).toBeVisible()

      colours[theme] = await page
        .getByTestId('wheel-slice')
        .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.colour))
    }

    expect(colours.halloween).toEqual(colours.plain)
  })
})

/** F27 R10: the logo is the shop's, so it stayed in the Store module. */
test.describe('the logo', () => {
  test('uploads, shows on the player page, then removes', async ({ page, request }) => {
    // F08 R16: the player page shows the branding only once it knows who
    // is playing.
    await identifyPlayer(page.request)
    await openStore(page)

    await page.getByLabel('Logo', { exact: true }).setInputFiles(pngUpload())
    await expect(page.getByTestId('current-logo')).toBeVisible()

    await openPlayerPage(page, request)
    const logo = page.getByTestId('player-logo')
    await expect(logo).toBeVisible()

    // Actually fetched, not just an <img> pointing at a 404.
    const src = await logo.getAttribute('src')
    const response = await page.request.get(src ?? '')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('image/png')
    expect(response.headers()['x-content-type-options']).toBe('nosniff')

    await openStore(page)
    // Scoped: every prize row has a "Remove <prize>" button too.
    await page
      .getByTestId('store-section')
      .getByRole('button', { name: 'Remove logo', exact: true })
      .click()
    await expect(page.getByTestId('current-logo')).toHaveCount(0)

    await openPlayerPage(page, request)
    await expect(page.getByTestId('player-logo')).toHaveCount(0)
  })

  /**
   * F05 R6. This spec used to assert F04 R14 — that an SVG was refused —
   * which F05 superseded: an SVG is now accepted, sanitised on the way in,
   * and what lands on disk is the sanitiser's output. The script below is
   * the whole point of the rule, so it is what gets uploaded.
   */
  test('accepts an SVG, strips the script in it, and says what it removed', async ({ page }) => {
    await openStore(page)

    await page.getByLabel('Logo', { exact: true }).setInputFiles({
      name: 'logo.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">' +
          '<script>alert(1)</script><rect width="8" height="8" fill="#000"/></svg>',
      ),
    })

    await expect(page.getByTestId('current-logo')).toBeVisible()
    await expect(page.getByTestId('logo-notice')).toContainText(/removed/i)

    // What is served is the cleaned file, not what was uploaded.
    const src = await page.getByTestId('current-logo').getAttribute('src')
    const served = await page.request.get(src ?? '')

    expect(served.status()).toBe(200)
    expect(served.headers()['content-type']).toContain('image/svg+xml')
    expect(await served.text()).not.toContain('<script')

    await page
      .getByTestId('store-section')
      .getByRole('button', { name: 'Remove logo', exact: true })
      .click()
    await expect(page.getByTestId('current-logo')).toHaveCount(0)
  })

  /** F04 R16 */
  test('refuses a text file renamed to .png', async ({ page }) => {
    await openStore(page)

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
  /** F04 R12, F30 R5 — the game refuses it now */
  test('rejects an unknown theme', async ({ request }) => {
    const game = await theGame(request)
    const response = await request.put(`/api/admin/games/${game.id}`, {
      data: { name: DEFAULT_GAME_NAME, theme: 'easter' },
    })

    expect(response.status()).toBe(422)
    expect((await response.json()).error.violations[0].field).toBe('theme')
  })

  test('rejects a name over sixty characters', async ({ request }) => {
    const response = await request.put('/api/admin/store', {
      data: { companyName: 'a'.repeat(61) },
    })

    expect(response.status()).toBe(422)
  })

  test('serves no logo when none is set', async ({ request }) => {
    const response = await request.get('/api/branding/logo')

    expect(response.status()).toBe(404)
  })
})
