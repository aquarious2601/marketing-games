import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { signIn } from './auth'
import {
  DEFAULT_PRIZES,
  restoreDefaultWheel,
  rewardId,
  rewardIdsByName,
  theGame,
  wheelUri,
} from './wheel'

/**
 * F01 in a real browser, against the real API and a real database.
 *
 * Most of these only read. The ones that save are confined to a single
 * project and run in order, because they share one database and a parallel
 * writer would make them flap.
 */

/** F26 R14: the reward selector is a row's identity now, and its first field. */
function rewardField(page: Page, index: number) {
  return page.getByTestId('prize-row').nth(index).getByTestId('prize-reward')
}

function probabilityField(page: Page, index: number) {
  return page.getByTestId('prize-row').nth(index).getByLabel(/percentage$/i)
}

/** F27 R40: a wheel is a game's, so its page is the game's page. */
async function openGame(page: Page, request: APIRequestContext): Promise<void> {
  await page.goto(`/admin/games/${(await theGame(request)).id}`)
}

/**
 * The prize list's own Save, not the branding section's.
 *
 * Both live on the Game module since F09 put them on one page, and both are
 * labelled "Save" — an unscoped locator matches two and fails on strict
 * mode, which reads as the page being broken rather than the locator.
 */
function saveButton(page: Page) {
  return page.getByRole('region', { name: 'Prize list' }).getByRole('button', { name: 'Save' })
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
  test.beforeEach(async ({ page, request }) => {
    // `/admin` first, deliberately: F27 R36 moved the front door to the
    // Games module, and this is the spec that proves it in a real browser.
    // The prizes are a game's now, so the wheel is reached through one.
    await page.goto('/admin')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Games')

    await openGame(page, request)
    await expect(page.getByTestId('prize-row').first()).toBeVisible()
  })

  /** F01 R2 */
  test('creates and shows the default wheel', async ({ page }) => {
    await expect(page.getByTestId('prize-row')).toHaveCount(DEFAULT_PRIZES.length)

    for (const [index, { reward, probability }] of DEFAULT_PRIZES.entries()) {
      // F26 R1: the row says what it gives, and that is what it is called.
      // The losing row shows its reward's name as text (R16); the rest show
      // it as the selected option.
      await expect(page.getByTestId('prize-row').nth(index)).toContainText(reward)
      await expect(probabilityField(page, index)).toHaveValue(String(probability))
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
    const configuration = await (await request.get(await wheelUri(request))).json()

    const rendered = await page
      .getByTestId('wheel-slice')
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.colour))

    expect(rendered).toEqual(
      configuration.prizes.map((prize: { colour: string }) => prize.colour),
    )
  })

  /** F01 R18 with F26 R1: the label follows the reward, live. */
  test('redraws the preview when a reward is chosen, before saving', async ({ page }) => {
    await rewardField(page, 1).selectOption({ label: 'Free gift' })

    await expect(
      page.locator('[data-testid="wheel-slice"] tspan', { hasText: 'Free gift' }).first(),
    ).toBeVisible()
  })

  /** F01 R17, R9 */
  test('marks the total invalid and disables saving when it is not 100', async ({ page }) => {
    await probabilityField(page, 0).fill('37')

    const total = page.getByTestId('probability-total')
    await expect(total).toHaveAttribute('data-valid', 'false')
    await expect(total).toContainText('97')
    await expect(saveButton(page)).toBeDisabled()
  })

  /**
   * F13 R7, in place of F01 R4's blank name that F26 R10 removed: the one
   * thing a slice can still be missing is the reward it gives.
   */
  test('refuses a slice that gives nothing', async ({ page }) => {
    await rewardField(page, 1).selectOption('')

    await expect(page.getByText(/choose what this slice gives away/i)).toBeVisible()
    await expect(saveButton(page)).toBeDisabled()
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

  /*
   * F01 R16 used to be proved here by typing markup into a prize name. F26
   * R14 removed that field, and the rule now belongs to the reward's name,
   * which this module cannot type: WheelControllerTest proves it instead, on
   * the payload the wheel is drawn from.
   */

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
    // This throws if the restore is refused: a clean-up that fails quietly
    // is worse than no clean-up, because the failure lands on whichever
    // test runs next and looks like that test's fault.
    await restoreDefaultWheel(request)
  })

  /** F26 R1: what a slice gives is the only thing on it left to change. */
  test('persists a changed reward across a reload', async ({ page, request }) => {
    await openGame(page, request)
    await rewardField(page, 1).selectOption({ label: 'Free gift' })
    const chosen = await rewardField(page, 1).inputValue()

    await saveButton(page).click()
    await expect(page.getByText('Saved')).toBeVisible()

    await page.reload()
    await expect(rewardField(page, 1)).toHaveValue(chosen)
    await expect(page.getByTestId('prize-row').nth(1)).toContainText('Free gift')
  })

  /** F01 R7 — order survives, and the reorder clears the unique constraint */
  test('persists a reorder', async ({ page, request }) => {
    await openGame(page, request)

    // Rows 1 and 2, not 0 and 1: the losing slice holds position one and
    // cannot be moved off it (F14 R5), so its ↓ is deliberately disabled.
    const secondReward = await rewardField(page, 1).inputValue()
    const thirdReward = await rewardField(page, 2).inputValue()

    await page
      .getByTestId('prize-row')
      .nth(1)
      .getByRole('button', { name: /^move down/i })
      .click()
    await saveButton(page).click()
    await expect(page.getByText('Saved')).toBeVisible()

    await page.reload()
    await expect(rewardField(page, 1)).toHaveValue(thirdReward)
    await expect(rewardField(page, 2)).toHaveValue(secondReward)
  })

  test('persists a removed prize', async ({ page, request }) => {
    await openGame(page, request)

    // The second row: removing the first would take the losing slice and
    // the toggle with it (F14 R6), which is a different test.
    await page
      .getByTestId('prize-row')
      .nth(1)
      .getByRole('button', { name: /^remove/i })
      .click()
    // Put the freed percentage back so the total is 100 again.
    await probabilityField(page, 0).fill('65')

    await saveButton(page).click()
    await expect(page.getByText('Saved')).toBeVisible()

    await page.reload()
    await expect(page.getByTestId('prize-row')).toHaveCount(5)
  })
})

/** The API contract from F01 section 8. */
test.describe('the wheel API', () => {
  test('rejects a total that is not 100 with a field-level 422', async ({ request }) => {
    // Every slice names a reward (F13 R7), so that the only thing wrong
    // with this payload is the total. Without one the first violation is
    // about the missing reward and this stops being a test about the total.
    const catalogue = await rewardIdsByName(request)
    const free = rewardId(catalogue, 'Free gift')

    const response = await request.put(await wheelUri(request), {
      data: {
        prizes: [
          { name: 'A', probability: 60, rewardId: free },
          { name: 'B', probability: 37, rewardId: free },
        ],
      },
    })

    expect(response.status()).toBe(422)

    const body = await response.json()
    expect(body.error.violations[0].field).toBe('prizes')
    expect(body.error.violations[0].message).toContain('97')
  })

  test('leaves the stored wheel untouched when a save is rejected', async ({ request }) => {
    const before = await (await request.get(await wheelUri(request))).json()

    await request.put(await wheelUri(request), {
      data: { prizes: [{ probability: 100 }] },
    })

    const after = await (await request.get(await wheelUri(request))).json()
    expect(after.prizes).toEqual(before.prizes)
  })
})
