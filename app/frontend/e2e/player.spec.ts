import { expect, test, type Page } from '@playwright/test'
import { identifyPlayer } from './player'

/**
 * F02 in a real browser, against the real API and database.
 *
 * Replaces the P00 placeholder-page spec: that page no longer exists, and
 * the health endpoint it exercised is still covered in api.spec.ts.
 *
 * F08 put an identity step in front of the wheel, so every test here
 * identifies first — through the API, so that these stay specs about the
 * wheel rather than about the step. The step itself is checked by hand.
 */

const DEFAULT_PRIZE_COUNT = 6

function spinButton(page: Page) {
  return page.getByTestId('spin-button')
}

/**
 * Spins and waits for the wheel to settle. The animation is real here, so
 * the result panel genuinely waits four seconds for the transition to end.
 */
async function spinAndWait(page: Page) {
  await spinButton(page).click()

  return page.getByTestId('spin-result').waitFor({ state: 'visible', timeout: 15_000 })
}

test.describe('the player page', () => {
  test.beforeEach(async ({ page }) => {
    await identifyPlayer(page.request)

    /*
     * Read rather than hard-coded. Before F27 the heading fell back to
     * "Spin to win" (F04 R24); now it is the game's own name, and asserting
     * one literal here would make this spec depend on whatever another file
     * last saved (P01 R5).
     */
    const { branding } = await (await page.request.get('/api/wheel')).json()

    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(branding.campaignName)
    await expect(page.getByTestId('wheel-preview')).toBeVisible()
  })

  test('shows the configured prizes on equal slices', async ({ page }) => {
    await expect(page.getByTestId('wheel-slice')).toHaveCount(DEFAULT_PRIZE_COUNT)

    const lengths = await page
      .locator('[data-testid="wheel-slice"] path')
      .evaluateAll((paths) => paths.map((path) => (path as SVGPathElement).getTotalLength()))

    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThan(0.5)
  })

  /**
   * F02 R2 — the single thing that must never leak to a player.
   *
   * Note this cannot simply assert that "%" is absent: prizes are legitimately
   * named things like "5% off your next order". What must be absent is the
   * odds, which the admin preview renders as a bare "40%" beneath each name.
   */
  test('shows prize names but never the odds', async ({ page, request }) => {
    const { prizes } = await (await request.get('/api/wheel')).json()

    const labels = await page
      .locator('[data-testid="wheel-slice"] title')
      .evaluateAll((titles) => titles.map((title) => title.textContent))

    expect(labels).toEqual(prizes.map((prize: { name: string }) => prize.name))

    const barePercentages = await page
      .locator('[data-testid="wheel-slice"] tspan')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.textContent ?? '').filter((text) => /^\d+%$/.test(text)),
      )

    expect(barePercentages).toEqual([])
  })

  test('shows the pointer the winning slice stops under', async ({ page }) => {
    await expect(page.getByTestId('wheel-pointer')).toBeVisible()
  })

  /** F02 R13 — the result and the resting slice must agree */
  test('comes to rest on the prize it says was won', async ({ page }) => {
    await spinAndWait(page)

    const announced = (await page.getByTestId('spin-result').innerText()).replace(/\s+/g, ' ')

    // Work out which slice the pointer is over, from the DOM, and compare.
    const underPointer = await page.evaluate(() => {
      const preview = document.querySelector('[data-testid="wheel-preview"]') as SVGSVGElement
      const rotation = Number(preview.dataset.rotation)
      const slices = Array.from(document.querySelectorAll('[data-testid="wheel-slice"]'))
      const sweep = 360 / slices.length
      const angle = ((((-rotation % 360) + 360) % 360) / sweep) | 0

      return slices[angle % slices.length].querySelector('title')?.textContent ?? ''
    })

    expect(underPointer).not.toBe('')
    expect(announced).toContain(underPointer)
  })

  test('announces a prize that is actually on the wheel', async ({ page }) => {
    const names = await page
      .locator('[data-testid="wheel-slice"] title')
      .evaluateAll((titles) => titles.map((t) => t.textContent ?? ''))

    await spinAndWait(page)

    const announced = await page.getByTestId('spin-result').innerText()

    expect(names.some((name) => announced.includes(name))).toBe(true)
  })

  /** F02 R14 */
  test('reveals nothing until the wheel has stopped', async ({ page }) => {
    await spinButton(page).click()

    // Immediately after the click the wheel is still turning.
    await expect(spinButton(page)).toBeDisabled()
    await expect(page.getByTestId('spin-result')).toHaveCount(0)

    await expect(page.getByTestId('spin-result')).toBeVisible({ timeout: 15_000 })
  })

  /** F02 R15 */
  test('disables the button while the wheel is turning', async ({ page }) => {
    await spinButton(page).click()

    await expect(spinButton(page)).toBeDisabled()
    await expect(spinButton(page)).toHaveText(/spinning/i)
  })

  /**
   * ~~F02 R16: another spin after a result.~~ **Superseded by F10 R1.**
   *
   * This is a stall's device, so a result is followed by the next person
   * starting rather than by another go for the last one. The route back to
   * the wheel is the phone step, where the same number is recognised
   * (F10 R6).
   */
  test('hands over to the next player after a result', async ({ page }) => {
    await spinAndWait(page)

    await expect(page.getByTestId('next-player-button')).toHaveText('Next customer')
    // F10 R8: absent, not disabled.
    await expect(spinButton(page)).toHaveCount(0)

    await page.getByTestId('next-player-button').click()

    await expect(page.getByTestId('identity-phone')).toBeVisible()
    await expect(page.getByTestId('spin-result')).toHaveCount(0)
  })

  /** F02 R17 */
  test('reports a failed spin without announcing a prize', async ({ page }) => {
    await page.route('**/api/spin', (route) => route.abort('failed'))

    await spinButton(page).click()

    await expect(page.getByRole('alert')).toContainText(/could not be completed/i)
    await expect(page.getByTestId('spin-result')).toHaveCount(0)
    await expect(spinButton(page)).toBeEnabled()
  })

  test('fits the viewport with no horizontal scroll', async ({ page }) => {
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))

    expect(
      scrollWidth,
      `The player page scrolls sideways: ${scrollWidth}px of content in a ${clientWidth}px viewport.`,
    ).toBeLessThanOrEqual(clientWidth)
  })

  /**
   * The reward is the thing the game exists to deliver, so it has to be on
   * screen the moment it is revealed — on a phone as much as a monitor.
   *
   * It used to be a panel below the Spin button, which on a phone sits at the
   * bottom of the window: the player spun, watched, and then had to scroll to
   * find out what they had won. Hence both halves of this check: the panel is
   * inside the viewport, and the page has not quietly grown a scrollbar for
   * it either.
   */
  test('shows the result without scrolling', async ({ page }) => {
    await spinAndWait(page)

    const box = await page.getByTestId('spin-result').boundingBox()
    const viewport = page.viewportSize()

    expect(box, 'The result panel has no box on screen at all.').not.toBeNull()
    expect(viewport).not.toBeNull()

    const { scrollY, scrollHeight, clientHeight } = await page.evaluate(() => ({
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    }))

    expect(scrollY, 'The page scrolled to bring the result into view.').toBe(0)
    expect(
      scrollHeight,
      `The result made the page scroll: ${scrollHeight}px of content in a ${clientHeight}px viewport.`,
    ).toBeLessThanOrEqual(clientHeight + 1)

    expect(box!.y, 'The result panel starts above the top of the viewport.').toBeGreaterThanOrEqual(
      0,
    )
    expect(
      box!.y + box!.height,
      `The result panel runs past the bottom of the viewport: ${box!.y + box!.height}px in a ${viewport!.height}px window.`,
    ).toBeLessThanOrEqual(viewport!.height)
  })

  test('applies its stylesheet', async ({ page }) => {
    const background = await page
      .locator('main')
      .evaluate((element) => getComputedStyle(element).backgroundColor)

    expect(background).not.toBe('rgba(0, 0, 0, 0)')
  })
})

/** F03 — the animation, in a real browser where the transitions actually run. */
test.describe('the spin animation', () => {
  test.beforeEach(async ({ page }) => {
    await identifyPlayer(page.request)
    await page.goto('/')
    await expect(page.getByTestId('wheel-preview')).toBeVisible()
  })

  test('is running immediately after the button is pressed', async ({ page }) => {
    await expect(page.getByTestId('wheel-stage')).toHaveAttribute('data-phase', 'idle')

    await spinButton(page).click()

    // Any phase but idle; which one depends on how fast this machine is.
    await expect(page.getByTestId('wheel-stage')).not.toHaveAttribute('data-phase', 'idle')
  })

  /** F03 R7 — proves all three phases really ran, not just the last one */
  test('takes about six seconds before showing the result', async ({ page }) => {
    const started = Date.now()

    await spinAndWait(page)

    const elapsed = Date.now() - started

    expect(elapsed, 'The spin finished too quickly for the animation to have run.').toBeGreaterThan(
      5_000,
    )
    expect(elapsed, 'The spin took far longer than the six seconds it should.').toBeLessThan(12_000)
  })

  /** F03 R1 — it ends at rest, whatever it passed through */
  test('comes to rest when it finishes', async ({ page }) => {
    await spinAndWait(page)

    await expect(page.getByTestId('wheel-stage')).toHaveAttribute('data-phase', 'idle')
  })

  /** F03 R13 */
  test('keeps the button disabled for the whole animation', async ({ page }) => {
    await spinButton(page).click()

    // Still turning three seconds in, long past the old four-second spin's
    // first phase and well before this one ends.
    await page.waitForTimeout(3_000)
    await expect(spinButton(page)).toBeDisabled()

    await page.getByTestId('spin-result').waitFor({ state: 'visible', timeout: 15_000 })

    // The result replaces the spin control with the hand-over (F10 R1), so
    // "no longer blocked" is now asserted on that button.
    await expect(page.getByTestId('next-player-button')).toBeEnabled()
  })
})

test.describe('when the game cannot be loaded', () => {
  test('offers a retry and no spin button', async ({ page }) => {
    await page.route('**/api/wheel', (route) => route.abort('failed'))
    await page.goto('/')

    await expect(page.getByRole('alert')).toContainText(/could not be loaded/i)
    await expect(page.getByTestId('spin-button')).toHaveCount(0)
  })
})

/**
 * F03 R12, as amended: the system preference is deliberately ignored, so a
 * browser asking for reduced motion gets exactly the same spin as everyone
 * else. The reasoning and its cost are in F03 section 13.
 */
test.describe('with a reduced-motion preference', () => {
  test.use({ reducedMotion: 'reduce' })

  test('still runs the full spin', async ({ page }) => {
    await identifyPlayer(page.request)
    await page.goto('/')
    await expect(page.getByTestId('wheel-preview')).toBeVisible()

    const started = Date.now()
    await spinButton(page).click()

    await expect(page.getByTestId('wheel-stage')).not.toHaveAttribute('data-phase', 'idle')
    await page.getByTestId('spin-result').waitFor({ state: 'visible', timeout: 15_000 })

    expect(
      Date.now() - started,
      'A reduced-motion browser skipped the animation; it should get the same spin as everyone else.',
    ).toBeGreaterThan(5_000)
  })

  test('comes to rest afterwards', async ({ page }) => {
    await identifyPlayer(page.request)
    await page.goto('/')
    await expect(page.getByTestId('wheel-preview')).toBeVisible()

    await spinAndWait(page)

    await expect(page.getByTestId('wheel-stage')).toHaveAttribute('data-phase', 'idle')
  })
})

/** The player-facing API contract from F02 section 8. */
test.describe('the player API', () => {
  test('serves the wheel without any probabilities', async ({ request }) => {
    const response = await request.get('/api/wheel')

    expect(response.status()).toBe(200)
    expect(await response.text()).not.toContain('probability')

    const body = await response.json()
    for (const prize of body.prizes) {
      expect(Object.keys(prize).sort()).toEqual(['colour', 'id', 'name', 'position'])
    }
  })

  test('draws a prize and reports no odds', async ({ request }) => {
    await identifyPlayer(request)

    const response = await request.post('/api/spin')

    expect(response.status()).toBe(200)
    expect(await response.text()).not.toContain('probability')

    const body = await response.json()
    expect(body.prize).toHaveProperty('name')
    expect(body).toHaveProperty('spunAt')
  })

  test('refuses to spin on a GET', async ({ request }) => {
    const response = await request.get('/api/spin')

    expect(response.status()).toBe(405)
  })
})
