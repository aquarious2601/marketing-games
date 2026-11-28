import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, ApiValidationError } from '../api/client'
import {
  fetchIdentity,
  fetchPlayerWheel,
  forgetPlayer,
  identifyPhone,
  registerPlayer,
  resolvePlay,
  spin,
  type PlayerState,
  type PlayerWheel,
  type SpinReward,
} from '../api/player'
import { THEMES, THEME_NAMES } from '../branding/themes'
import { I18nProvider } from '../i18n/I18nContext'
import { STORAGE_KEY } from '../i18n/locales'
import { colourFor } from '../games/wheel/palette'
import { CELEBRATION_MS } from './Confetti'
import { PlayerPage } from './PlayerPage'
import { sliceUnderPointer } from '../games/wheel/rotation'

vi.mock('../api/player', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/player')>()),
  fetchPlayerWheel: vi.fn(),
  resolvePlay: vi.fn(),
  spin: vi.fn(),
  fetchIdentity: vi.fn(),
  identifyPhone: vi.fn(),
  registerPlayer: vi.fn(),
  forgetPlayer: vi.fn(),
}))

const fetchWheelMock = vi.mocked(fetchPlayerWheel)
const resolvePlayMock = vi.mocked(resolvePlay)
const spinMock = vi.mocked(spin)
const fetchIdentityMock = vi.mocked(fetchIdentity)
const identifyPhoneMock = vi.mocked(identifyPhone)
const registerPlayerMock = vi.mocked(registerPlayer)
const forgetPlayerMock = vi.mocked(forgetPlayer)

/**
 * F08 R1: there is no wheel until somebody is identified, so every test about
 * the wheel starts from an identified player. The identity step has its own
 * describe block at the bottom of this file.
 */
const PLAYER = { firstName: 'Anh', phone: '0912345678' }

/*
 * What GET /api/player/me answers, which since F20 is two facts rather than
 * one: who, and whether that identification has had its spin (F20 R5, R9).
 */
const NOBODY = { player: null, spin: null, spinsLeft: null }
const IDENTIFIED = { player: PLAYER, spin: null, spinsLeft: null }

/*
 * What identify and register answer (F08 R5, F23 R13).
 *
 * Named rather than written out at each call site: since F23 they carry the
 * person's day as well as their name, and a dozen copies of one literal is a
 * dozen places to forget it.
 */
const UNKNOWN_NUMBER = { known: false, phone: '0912345678', player: null, spinsLeft: null }
const KNOWN_NUMBER = { known: true, phone: '0912345678', player: PLAYER, spinsLeft: null }
/*
 * F34 R7, R9. A registration that created the customer comes back with
 * their card, so this fixture is what the server actually sends — and the
 * card screen is now part of the path from the form to the wheel.
 */
const REGISTERED = { player: PLAYER, spinsLeft: null, card: 'M9PXK-4T7VH' }

/**
 * An identification that has already had its spin (F20 R5).
 *
 * The prize *name* and no position, which is the whole shape of the reload
 * case: nothing is animated, because the spin happened in a page that no
 * longer exists.
 */
function alreadySpun(prizeName = 'Free sample', reward?: Partial<SpinReward>) {
  return {
    player: PLAYER,
    spin: {
      prizeName,
      reward: {
        type: 'free_product' as const,
        value: null,
        code: 'A7K3-M9PX',
        ...reward,
      },
      spunAt: '2026-11-14T20:00:00+00:00',
    },
    /*
     * F23. Unlimited unless a test says otherwise: this helper is about
     * the reload case (F20 R5), and every one of its callers predates the
     * daily limit. A test that wants an exhausted day passes its own.
     */
    spinsLeft: null as number | null,
  }
}

const PRIZES = ['Try again', 'Free sample', 'Free gift', 'Grand prize']

const PLAIN_BRANDING = {
  companyName: null,
  campaignName: '',
  backgroundUrl: null,
  tagline: 'One spin, one prize. Good luck.',
  theme: 'plain',
  currency: 'VND',
  currencySymbol: '₫',
  logoUrl: null,
}

function wheel(branding: Partial<PlayerWheel['branding']> = {}): PlayerWheel {
  return {
    prizes: PRIZES.map((name, index) => ({
      id: index + 1,
      name,
      position: index,
      colour: '#475569', rewardId: 1,
    })),
    branding: { ...PLAIN_BRANDING, ...branding },
  }
}

function result(position: number, reward?: Partial<SpinReward>) {
  return {
    prize: wheel().prizes[position],
    // F13 R20: a free product by default, so the existing tests describe
    // the case that carries no code. The code tests pass their own.
    reward: {
      type: 'free_product' as const,
      value: null,
      code: null,
      ...reward,
    },
    spunAt: '2026-11-14T20:00:00+00:00',
  }
}

/** Reduced motion off by default, so the animation path is what gets tested. */
function stubMatchMedia(reduced: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: reduced,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  )
}

beforeEach(() => {
  fetchWheelMock.mockReset()
  spinMock.mockReset()
  fetchIdentityMock.mockReset()
  identifyPhoneMock.mockReset()
  registerPlayerMock.mockReset()
  forgetPlayerMock.mockReset()

  fetchWheelMock.mockResolvedValue(wheel())
  fetchIdentityMock.mockResolvedValue(IDENTIFIED)
  forgetPlayerMock.mockResolvedValue(undefined)
  stubMatchMedia(false)
})

async function renderPlayer() {
  const user = userEvent.setup()
  render(<PlayerPage />)
  await screen.findByTestId('wheel-preview')

  return user
}

/** jsdom runs no transitions, so each phase's end is fired by hand. */
function endPhase() {
  fireEvent.transitionEnd(screen.getByTestId('wheel-face'))
}

/** Drives all three F03 phases through to the result. */
function finishTheSpin() {
  endPhase() // wind-up
  endPhase() // turn
  endPhase() // settle
}

function phase(): string | undefined {
  return screen.getByTestId('wheel-stage').dataset.phase
}

describe('loading', () => {
  it('shows the wheel with every prize name', async () => {
    await renderPlayer()

    for (const name of PRIZES) {
      expect(screen.getByText(name, { selector: 'tspan' })).toBeInTheDocument()
    }
  })

  /**
   * F02 R2. A prize may legitimately be named "5% off", so the test is that
   * the odds are absent, not the percent sign.
   */
  it('shows a prize name containing a percent sign, but never the odds', async () => {
    fetchWheelMock.mockResolvedValue({
      prizes: [
        { id: 1, name: '5% off your next order', position: 0, colour: '#475569' },
        { id: 2, name: 'Try again', position: 1, colour: '#E11D48' },
      ],
      branding: PLAIN_BRANDING,
    })

    await renderPlayer()

    // The visible label is shortened to fit the slice, so the full name is
    // asserted on the title, which is also what assistive technology reads.
    const titles = Array.from(document.querySelectorAll('[data-testid="wheel-slice"] title')).map(
      (title) => title.textContent,
    )

    expect(titles).toEqual(['5% off your next order', 'Try again'])
    expect(screen.queryByText(/^\d+%$/, { selector: 'tspan' })).not.toBeInTheDocument()
  })

  /** F02 R19 */
  it('draws one slice per prize', async () => {
    await renderPlayer()

    expect(screen.getAllByTestId('wheel-slice')).toHaveLength(PRIZES.length)
  })

  it('shows the pointer the winning slice stops under', async () => {
    await renderPlayer()

    expect(screen.getByTestId('wheel-pointer')).toBeInTheDocument()
  })

  it('offers a retry and no wheel when the game cannot be loaded', async () => {
    fetchWheelMock.mockRejectedValue(new ApiError('nope', 500))
    const user = userEvent.setup()
    render(<PlayerPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i)
    expect(screen.queryByTestId('spin-button')).not.toBeInTheDocument()

    fetchWheelMock.mockResolvedValue(wheel())
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(await screen.findByTestId('wheel-preview')).toBeInTheDocument()
  })
})

describe('spinning', () => {
  it('asks the server for the result and shows it when the wheel stops', async () => {
    spinMock.mockResolvedValue(result(2))
    const user = await renderPlayer()

    await user.click(screen.getByTestId('spin-button'))
    await waitFor(() => expect(spinMock).toHaveBeenCalledOnce())

    // F02 R14: nothing is revealed until the wheel has finished turning.
    expect(screen.queryByTestId('spin-result')).not.toBeInTheDocument()

    finishTheSpin()

    expect(await screen.findByTestId('spin-result')).toHaveTextContent('Free gift')
  })

  /**
   * F02 R13. The honesty check: the slice that ends up under the pointer must
   * be the one the server drew, not whatever the animation happened to reach.
   */
  it.each([0, 1, 2, 3])('stops on the slice the server drew (position %i)', async (position) => {
    spinMock.mockResolvedValue(result(position))
    const user = await renderPlayer()

    await user.click(screen.getByTestId('spin-button'))

    // Run the animation right through: the resting place is what matters,
    // and the first thing that happens is a wind-up in the other direction.
    await waitFor(() => expect(phase()).toBe('windup'))
    finishTheSpin()

    await waitFor(() => {
      const rotation = Number(screen.getByTestId('wheel-preview').dataset.rotation)

      expect(
        sliceUnderPointer(rotation, PRIZES.length),
        `The wheel came to rest on a different prize from the one the server drew.`,
      ).toBe(position)
    })
  })

  /** F02 R15 */
  it('disables the button while a spin is in progress', async () => {
    spinMock.mockReturnValue(new Promise(() => {}))
    const user = await renderPlayer()

    await user.click(screen.getByTestId('spin-button'))

    expect(screen.getByTestId('spin-button')).toBeDisabled()
    expect(screen.getByTestId('spin-button')).toHaveTextContent(/spinning/i)
  })

  it('ignores a second press while the wheel is turning', async () => {
    spinMock.mockResolvedValue(result(1))
    const user = await renderPlayer()

    const button = screen.getByTestId('spin-button')
    await user.click(button)
    await user.click(button)

    await waitFor(() => expect(spinMock).toHaveBeenCalledTimes(1))
  })

  /** F02 R16 */
  /**
   * ~~F02 R16: the player may spin again.~~ **Superseded by F10 R1.** This is
   * a stall's device, so what follows a result is the next person starting,
   * not another go for the last one. The route to a second spin is through
   * the phone step, which is the same person's number and no more (F10 R6).
   */
  it('offers a hand-over rather than another spin after a result', async () => {
    spinMock.mockResolvedValue(result(0))
    const user = await renderPlayer()

    await user.click(screen.getByTestId('spin-button'))
    await waitFor(() => expect(spinMock).toHaveBeenCalledOnce())
    finishTheSpin()

    await screen.findByTestId('spin-result')

    expect(screen.getByTestId('next-player-button')).toHaveTextContent('Next customer')

    // F10 R8: absent, not disabled. The two look the same to a person and
    // completely different to whoever picks the device up next.
    expect(screen.queryByTestId('spin-button')).not.toBeInTheDocument()
    expect(spinMock).toHaveBeenCalledTimes(1)
  })

  /**
   * F10 R9. The row stays and only the control inside it goes — dropping the
   * line would shorten the card at the moment the prize appears, which is
   * the jolt ResultPanel exists to avoid.
   */
  it('drops "Not you?" but keeps the identity line once a result is up', async () => {
    spinMock.mockResolvedValue(result(0))
    const user = await renderPlayer()

    expect(screen.getByTestId('forget-player')).toBeInTheDocument()

    await user.click(screen.getByTestId('spin-button'))
    await waitFor(() => expect(spinMock).toHaveBeenCalledOnce())
    finishTheSpin()
    await screen.findByTestId('spin-result')

    expect(screen.queryByTestId('forget-player')).not.toBeInTheDocument()
    expect(screen.getByTestId('player-identity')).toHaveTextContent('Playing as Anh')
  })

  /** F10 R3, R7 — the next player starts clean, and may be the same person */
  it('shows no stale result once the next player has identified', async () => {
    spinMock.mockResolvedValue(result(0))
    identifyPhoneMock.mockResolvedValue(KNOWN_NUMBER)
    const user = await renderPlayer()

    await user.click(screen.getByTestId('spin-button'))
    await waitFor(() => expect(spinMock).toHaveBeenCalledOnce())
    finishTheSpin()
    await screen.findByTestId('spin-result')

    await user.click(screen.getByTestId('next-player-button'))
    await screen.findByTestId('identity-phone')

    await user.type(screen.getByTestId('phone-input'), '0912345678')
    await user.click(screen.getByTestId('phone-submit'))

    expect(await screen.findByTestId('spin-button')).toBeEnabled()
    expect(screen.queryByTestId('spin-result')).not.toBeInTheDocument()
  })

  /** F02 R17 */
  it('shows an error and announces no prize when the spin fails', async () => {
    spinMock.mockRejectedValue(new ApiError('boom', 500))
    const user = await renderPlayer()

    await user.click(screen.getByTestId('spin-button'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be completed/i)
    expect(screen.queryByTestId('spin-result')).not.toBeInTheDocument()
    expect(screen.getByTestId('spin-button')).toBeEnabled()
  })

  it('lets the player try again after a failed spin', async () => {
    spinMock.mockRejectedValueOnce(new ApiError('boom', 500))
    const user = await renderPlayer()

    await user.click(screen.getByTestId('spin-button'))
    await screen.findByRole('alert')

    spinMock.mockResolvedValue(result(1))
    await user.click(screen.getByTestId('spin-button'))
    await waitFor(() => expect(spinMock).toHaveBeenCalledTimes(2))
    finishTheSpin()

    expect(await screen.findByTestId('spin-result')).toHaveTextContent('Free sample')
  })

  /**
   * The admin may have reconfigured the wheel since this page loaded, so the
   * slice list is refreshed before the rotation is worked out.
   */
  it('refreshes the wheel before deciding where to stop', async () => {
    spinMock.mockResolvedValue(result(1))
    const user = await renderPlayer()

    fetchWheelMock.mockClear()
    await user.click(screen.getByTestId('spin-button'))

    await waitFor(() => expect(fetchWheelMock).toHaveBeenCalled())
  })
})

/** F04 */
describe('branding and themes', () => {
  /** F04 R23 */
  it('shows the campaign name as the heading and the company beneath', async () => {
    fetchWheelMock.mockResolvedValue(
      wheel({ companyName: 'AA Store', campaignName: 'Black Friday Giveaway' }),
    )

    await renderPlayer()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Black Friday Giveaway')
    expect(screen.getByTestId('player-company')).toHaveTextContent('AA Store')
  })

  /** F04 R28 — the admin's phrase */
  it('shows the configured tagline', async () => {
    fetchWheelMock.mockResolvedValue(wheel({ tagline: 'Spin for a treat!' }))

    await renderPlayer()

    expect(screen.getByTestId('player-tagline')).toHaveTextContent('Spin for a treat!')
  })

  it('shows the default phrase when the admin has set none', async () => {
    await renderPlayer()

    expect(screen.getByTestId('player-tagline')).toHaveTextContent(
      'One spin, one prize. Good luck.',
    )
  })

  it('renders a tagline containing markup as text', async () => {
    fetchWheelMock.mockResolvedValue(wheel({ tagline: '<b>win</b>' }))

    const { container } = render(<PlayerPage />)
    await screen.findByTestId('wheel-preview')

    expect(container.querySelector('[data-testid="player-tagline"] b')).toBeNull()
    expect(screen.getByTestId('player-tagline')).toHaveTextContent('<b>win</b>')
  })

  /** F04 R24 */
  it('falls back to "Spin to win" with no campaign name', async () => {
    await renderPlayer()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Spin to win')
  })

  /** F04 R25 */
  it('shows nothing at all where branding is unset', async () => {
    await renderPlayer()

    expect(screen.queryByTestId('player-company')).not.toBeInTheDocument()
    expect(screen.queryByTestId('player-logo')).not.toBeInTheDocument()
  })

  it('shows the logo when one is set', async () => {
    fetchWheelMock.mockResolvedValue(
      wheel({ companyName: 'AA Store', logoUrl: '/api/branding/logo?v=1' }),
    )

    await renderPlayer()

    const logo = screen.getByTestId('player-logo')
    expect(logo).toHaveAttribute('src', '/api/branding/logo?v=1')
    expect(logo).toHaveAttribute('alt', 'AA Store')
  })

  /** F04 R26 */
  it('keeps the header when the logo fails to load', async () => {
    fetchWheelMock.mockResolvedValue(
      wheel({ campaignName: 'Noel', logoUrl: '/api/branding/logo?v=1' }),
    )

    await renderPlayer()
    fireEvent.error(screen.getByTestId('player-logo'))

    expect(screen.queryByTestId('player-logo')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Noel')
    expect(screen.getByTestId('spin-button')).toBeInTheDocument()
  })

  /** F04 R6, R16 — names are text, never markup */
  it('renders a company name containing markup as text', async () => {
    fetchWheelMock.mockResolvedValue(wheel({ companyName: '<img src=x onerror=alert(1)>' }))

    const { container } = render(<PlayerPage />)
    await screen.findByTestId('wheel-preview')

    expect(container.querySelector('img[onerror]')).toBeNull()
    expect(screen.getByTestId('player-company')).toHaveTextContent('<img src=x onerror=alert(1)>')
  })

  /** F04 R22 */
  it.each(THEME_NAMES)('applies the %s theme background', async (theme) => {
    fetchWheelMock.mockResolvedValue(wheel({ theme }))

    await renderPlayer()

    const screenEl = screen.getByTestId('player-screen')
    expect(screenEl).toHaveAttribute('data-theme', theme)
    expect(screenEl).toHaveStyle({ backgroundColor: THEMES[theme].background })
  })

  /**
   * F35 R2, R16. A custom theme reaches this page as a palette it already
   * has and a picture it does not: the page is never told the word
   * “custom”, and nothing here has a case for it.
   */
  it('puts the shop’s own picture behind the game', async () => {
    const picture = '/api/branding/background/abcd1234abcd1234?v=1763650000'

    fetchWheelMock.mockResolvedValue(wheel({ theme: 'birthday', backgroundUrl: picture }))

    await renderPlayer()

    expect(screen.getByTestId('custom-background')).toHaveAttribute('src', picture)

    const screenEl = screen.getByTestId('player-screen')

    expect(screenEl).toHaveAttribute('data-theme', 'birthday')
    expect(screenEl).toHaveStyle({ backgroundColor: THEMES.birthday.background })
    // F35 R18's hook: the stylesheet gives the language picker a surface of
    // its own while a photograph is behind it.
    expect(screenEl).toHaveAttribute('data-backdrop', 'custom')
  })

  /** F35 R19. The picture is the scene; the painted one is not drawn over it. */
  it('draws none of the borrowed theme over the picture', async () => {
    fetchWheelMock.mockResolvedValue(
      wheel({ theme: 'christmas', backgroundUrl: '/api/branding/background/k?v=1' }),
    )

    await renderPlayer()

    expect(screen.getByTestId('theme-scene')).toHaveAttribute('data-scene', 'custom')
  })

  /** F35 R4, R19. No picture is the page exactly as it was. */
  it.each(THEME_NAMES)('leaves the %s page alone when there is no picture', async (theme) => {
    fetchWheelMock.mockResolvedValue(wheel({ theme, backgroundUrl: null }))

    await renderPlayer()

    expect(screen.queryByTestId('custom-background')).not.toBeInTheDocument()
    expect(screen.getByTestId('player-screen')).not.toHaveAttribute('data-backdrop')
  })

  /**
   * F04 R9, as rebuilt. A theme is a whole scene now, not a background
   * colour, and the scene has to be behind the content in the DOM as well as
   * in z-index — a decorative layer painted after the wheel would sit on top
   * of it for the whole six seconds it is turning.
   */
  it.each(THEME_NAMES)('paints the %s scene behind the content', async (theme) => {
    fetchWheelMock.mockResolvedValue(wheel({ theme }))

    await renderPlayer()

    const scene = screen.getByTestId('theme-scene')
    expect(scene).toHaveAttribute('data-scene', theme)

    const screenEl = screen.getByTestId('player-screen')
    expect(screenEl.firstElementChild).toBe(scene)
    expect(
      scene.compareDocumentPosition(screen.getByTestId('wheel-stage')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  /** The words sit on the card, which is the surface the contrast test measures. */
  it('puts the header, the wheel and the result on one card', async () => {
    spinMock.mockResolvedValue(result(0))
    const user = await renderPlayer()

    await user.click(screen.getByTestId('spin-button'))
    await waitFor(() => expect(spinMock).toHaveBeenCalledOnce())
    finishTheSpin()
    await screen.findByTestId('spin-result')

    const card = screen.getByTestId('player-header').parentElement

    expect(card).not.toBeNull()
    // `next-player-button` rather than `spin-button`: with a result on
    // screen the spin control no longer exists (F10 R8), and the hand-over
    // stands exactly where it did.
    for (const id of ['player-header', 'wheel-stage', 'next-player-button', 'spin-result']) {
      expect(card).toContainElement(screen.getByTestId(id))
    }
  })

  /** F04 R8 */
  it('renders an unrecognised theme as plain', async () => {
    fetchWheelMock.mockResolvedValue(wheel({ theme: 'easter' }))

    await renderPlayer()

    expect(screen.getByTestId('player-screen')).toHaveStyle({
      backgroundColor: THEMES.plain.background,
    })
    expect(screen.getByTestId('theme-scene')).toHaveAttribute('data-scene', 'plain')
  })

  /** F04 R10 — the wheel is identical whatever the theme */
  it.each(THEME_NAMES)('leaves the slice colours untouched on %s', async (theme) => {
    fetchWheelMock.mockResolvedValue(wheel({ theme }))

    await renderPlayer()

    const rendered = screen.getAllByTestId('wheel-slice').map((slice) => slice.dataset.colour)

    expect(rendered).toEqual(PRIZES.map((_, index) => colourFor(index)))
  })
})

/** F03 */
describe('the spin animation', () => {
  it('runs wind-up, turn and settle in order', async () => {
    spinMock.mockResolvedValue(result(2))
    const user = await renderPlayer()

    expect(phase()).toBe('idle')

    await user.click(screen.getByTestId('spin-button'))
    await waitFor(() => expect(phase()).toBe('windup'))

    endPhase()
    expect(phase()).toBe('turn')

    endPhase()
    expect(phase()).toBe('settle')

    endPhase()
    expect(phase()).toBe('idle')
  })

  /** F03 R11 */
  it('reveals the result only after the settle, not after the turn', async () => {
    spinMock.mockResolvedValue(result(1))
    const user = await renderPlayer()

    await user.click(screen.getByTestId('spin-button'))
    await waitFor(() => expect(phase()).toBe('windup'))

    endPhase()
    expect(screen.queryByTestId('spin-result')).not.toBeInTheDocument()

    endPhase()
    expect(
      screen.queryByTestId('spin-result'),
      'The result appeared at the end of the turn, before the wheel had settled.',
    ).not.toBeInTheDocument()

    endPhase()
    expect(await screen.findByTestId('spin-result')).toHaveTextContent('Free sample')
  })

  /** F03 R13 */
  it('keeps the button disabled through every phase', async () => {
    spinMock.mockResolvedValue(result(0))
    const user = await renderPlayer()

    await user.click(screen.getByTestId('spin-button'))
    await waitFor(() => expect(phase()).toBe('windup'))
    expect(screen.getByTestId('spin-button')).toBeDisabled()

    endPhase()
    expect(screen.getByTestId('spin-button')).toBeDisabled()

    endPhase()
    expect(screen.getByTestId('spin-button')).toBeDisabled()

    endPhase()
    // The settle reveals the result, which replaces the spin control with
    // the hand-over (F10 R1). What F03 R13 is about — that nothing can be
    // pressed while the wheel turns — is what the three assertions above
    // check; this one is that the player is no longer blocked.
    await waitFor(() => expect(screen.getByTestId('next-player-button')).toBeEnabled())
    expect(screen.queryByTestId('spin-button')).not.toBeInTheDocument()
  })

  /** F03 R2 — the wheel goes backwards first */
  it('moves the wheel backwards for the wind-up', async () => {
    spinMock.mockResolvedValue(result(2))
    const user = await renderPlayer()

    await user.click(screen.getByTestId('spin-button'))

    await waitFor(() => {
      const rotation = Number(screen.getByTestId('wheel-preview').dataset.rotation)
      expect(rotation).toBeLessThan(0)
    })
  })

  /** F03 R14 */
  it('runs no animation when the spin fails', async () => {
    spinMock.mockRejectedValue(new ApiError('boom', 500))
    const user = await renderPlayer()

    await user.click(screen.getByTestId('spin-button'))
    await screen.findByRole('alert')

    expect(phase()).toBe('idle')
    expect(Number(screen.getByTestId('wheel-preview').dataset.rotation)).toBe(0)
  })
})

/**
 * F03 R12, as amended. The system preference is deliberately ignored: a game
 * whose entire point is the spin must not render a dead button. The cost of
 * that decision is recorded in F03 section 13.
 */
describe('when the system asks for reduced motion', () => {
  it('still runs the full three-phase spin', async () => {
    stubMatchMedia(true)
    spinMock.mockResolvedValue(result(2))
    const user = await renderPlayer()

    await user.click(screen.getByTestId('spin-button'))

    await waitFor(() => expect(phase()).toBe('windup'))
    endPhase()
    expect(phase()).toBe('turn')
    endPhase()
    expect(phase()).toBe('settle')
  })

  it('still waits for the wheel before revealing the result', async () => {
    stubMatchMedia(true)
    spinMock.mockResolvedValue(result(2))
    const user = await renderPlayer()

    await user.click(screen.getByTestId('spin-button'))
    await waitFor(() => expect(phase()).toBe('windup'))

    expect(screen.queryByTestId('spin-result')).not.toBeInTheDocument()

    finishTheSpin()

    expect(await screen.findByTestId('spin-result')).toHaveTextContent('Free gift')
  })

  it('does not consult the system preference at all', async () => {
    const matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
    vi.stubGlobal('matchMedia', matchMedia)

    spinMock.mockResolvedValue(result(1))
    const user = await renderPlayer()
    await user.click(screen.getByTestId('spin-button'))
    await waitFor(() => expect(phase()).toBe('windup'))

    const askedAboutMotion = matchMedia.mock.calls.some(([query]) =>
      String(query).includes('prefers-reduced-motion'),
    )

    expect(askedAboutMotion).toBe(false)
  })
})

describe('the wheel at rest', () => {
  it('has no transition applied', async () => {
    await renderPlayer()

    expect(screen.getByTestId('wheel-face')).toHaveStyle({ transition: 'none' })
  })
})

/**
 * F08: the step in front of the wheel.
 *
 * The identity is never something this page decides. Every test here drives
 * it through what the server said, because that is the only thing the page is
 * allowed to believe (F08 R12).
 */
/**
 * F20: one spin per identification, and what a reload shows.
 *
 * The reported bug was that reloading after a spin left a working Spin
 * button. The page cannot see a reload, so these tests are the thing a
 * reload actually does: mount the page again and let it ask the server what
 * it knows.
 */
/**
 * F22: the couple of seconds after the wheel stops on a prize.
 *
 * The rule worth guarding is the negative one. A celebration on a losing
 * spin reads as mockery, and F17 exists because this page once told a
 * losing player they had won.
 */
describe('the celebration', () => {
  /** F22 R1, R3 */
  it('throws confetti when the wheel stops on a prize', async () => {
    spinMock.mockResolvedValue(result(0))
    const user = await renderPlayer()

    await user.click(screen.getByTestId('spin-button'))
    await waitFor(() => expect(spinMock).toHaveBeenCalledOnce())

    // F22 R3: not before the settle finishes. The wheel is still the story.
    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument()

    finishTheSpin()
    await screen.findByTestId('spin-result')

    expect(screen.getByTestId('confetti')).toBeInTheDocument()
  })

  /** F22 R2. The half of this feature that was asked for explicitly. */
  it('throws none at all on the losing slice', async () => {
    spinMock.mockResolvedValue(result(0, { type: 'nothing', code: null }))
    const user = await renderPlayer()

    await user.click(screen.getByTestId('spin-button'))
    await waitFor(() => expect(spinMock).toHaveBeenCalledOnce())
    finishTheSpin()

    const panel = await screen.findByTestId('spin-result')

    expect(panel).toHaveTextContent('Thanks for playing')
    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument()
  })

  /** F22 R8: it clears itself rather than animating behind the result. */
  it('removes itself once it is over', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    try {
      spinMock.mockResolvedValue(result(0))
      const user = await renderPlayer()

      await user.click(screen.getByTestId('spin-button'))
      await waitFor(() => expect(spinMock).toHaveBeenCalledOnce())
      finishTheSpin()
      await screen.findByTestId('spin-result')

      expect(screen.getByTestId('confetti')).toBeInTheDocument()

      await act(async () => {
        vi.advanceTimersByTime(CELEBRATION_MS + 50)
      })

      expect(screen.queryByTestId('confetti')).not.toBeInTheDocument()
      // The result stays. Only the celebration is over (F10 R5).
      expect(screen.getByTestId('spin-result')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  /**
   * F22 R11, and the reason it reads that way.
   *
   * The first version of this feature suppressed the celebration under a
   * reduced-motion preference, and it was invisible on the machine it was
   * built for: Windows reports `reduce` whenever animation effects are off,
   * as do most automated browsers. A celebration most players never see is
   * not one. F03 R12 reached the same conclusion about the spin.
   */
  it('throws confetti even for somebody who asked for less motion', async () => {
    stubMatchMedia(true)
    spinMock.mockResolvedValue(result(0))
    const user = await renderPlayer()

    await user.click(screen.getByTestId('spin-button'))
    await waitFor(() => expect(spinMock).toHaveBeenCalledOnce())
    finishTheSpin()
    await screen.findByTestId('spin-result')

    expect(screen.getByTestId('confetti')).toBeInTheDocument()
  })

  /**
   * F22 R4. The rule most likely to be broken by a well-meaning
   * simplification: celebrating when the panel mounts is shorter and looks
   * identical the first time, and would then fire on every reload somebody
   * makes to re-read their code (F20 R6).
   */
  it('does not celebrate a result that was already won', async () => {
    fetchIdentityMock.mockResolvedValue(alreadySpun('Free gift'))

    render(<PlayerPage />)

    await screen.findByTestId('spin-result')

    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument()
  })

  /** F22 R5 */
  it('is cleared by handing over to the next player', async () => {
    spinMock.mockResolvedValue(result(0))
    const user = await renderPlayer()

    await user.click(screen.getByTestId('spin-button'))
    await waitFor(() => expect(spinMock).toHaveBeenCalledOnce())
    finishTheSpin()
    await screen.findByTestId('spin-result')
    expect(screen.getByTestId('confetti')).toBeInTheDocument()

    await user.click(screen.getByTestId('next-player-button'))

    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument()
  })

  /** F22 R9, R10: decoration, and silent to a screen reader. */
  it('says nothing and intercepts nothing', async () => {
    spinMock.mockResolvedValue(result(0))
    const user = await renderPlayer()

    await user.click(screen.getByTestId('spin-button'))
    await waitFor(() => expect(spinMock).toHaveBeenCalledOnce())
    finishTheSpin()
    await screen.findByTestId('spin-result')

    const confetti = screen.getByTestId('confetti')

    expect(confetti).toHaveAttribute('aria-hidden', 'true')
    expect(confetti.className).toContain('pointer-events-none')

    // F03 R1: outside the box whose transitions drive the spin's phases.
    expect(screen.getByTestId('wheel-stage')).not.toContainElement(confetti)
  })
})

describe('a reload after the spin', () => {
  /**
   * F20 R15. The question "who is this?" is open until the server answers,
   * and an open question is not the answer "nobody".
   */
  it('shows neither the form nor the wheel while it is still asking', async () => {
    let answer: (state: PlayerState) => void = () => {}
    fetchIdentityMock.mockReturnValue(
      new Promise<PlayerState>((resolve) => {
        answer = resolve
      }),
    )

    render(<PlayerPage />)

    expect(await screen.findByTestId('player-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('identity-phone')).not.toBeInTheDocument()
    expect(screen.queryByTestId('spin-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('spin-result')).not.toBeInTheDocument()

    answer(NOBODY)

    expect(await screen.findByTestId('identity-phone')).toBeInTheDocument()
  })

  /** F20 R15: and a reload after a spin lands on the result, never the form. */
  it('never flashes the phone form in front of a result', async () => {
    let answer: (state: PlayerState) => void = () => {}
    fetchIdentityMock.mockReturnValue(
      new Promise<PlayerState>((resolve) => {
        answer = resolve
      }),
    )

    render(<PlayerPage />)
    await screen.findByTestId('player-loading')

    answer(alreadySpun('Free gift'))

    expect(await screen.findByTestId('spin-result')).toHaveTextContent('Free gift')
    expect(screen.queryByTestId('identity-phone')).not.toBeInTheDocument()
  })

  /** F20 R6, R8 */
  it('shows the prize and the code again rather than a spin button', async () => {
    fetchIdentityMock.mockResolvedValue(alreadySpun('Free sample'))

    render(<PlayerPage />)

    const panel = await screen.findByTestId('spin-result')

    expect(panel).toHaveTextContent('Free sample')
    expect(screen.getByTestId('reward-code')).toHaveTextContent('A7K3-M9PX')

    // F10 R8: not disabled, absent.
    expect(screen.queryByTestId('spin-button')).not.toBeInTheDocument()
    expect(screen.getByTestId('next-player-button')).toBeInTheDocument()
  })

  /** F20 R6: and the wheel is at rest, not mid-spin. */
  it('does not replay the animation for a spin that already finished', async () => {
    fetchIdentityMock.mockResolvedValue(alreadySpun())

    render(<PlayerPage />)

    await screen.findByTestId('spin-result')

    expect(screen.getByTestId('wheel-stage')).toHaveAttribute('data-phase', 'idle')
    expect(spinMock).not.toHaveBeenCalled()
  })

  /** F20 R6 with F17: a losing spin reloads as the losing panel. */
  it('shows the losing panel when that is what was won', async () => {
    fetchIdentityMock.mockResolvedValue(
      alreadySpun('Try again', { type: 'nothing', code: null }),
    )

    render(<PlayerPage />)

    const panel = await screen.findByTestId('spin-result')

    expect(panel).toHaveTextContent('Thanks for playing')
    expect(screen.queryByTestId('reward-code')).not.toBeInTheDocument()
    expect(screen.queryByTestId('spin-button')).not.toBeInTheDocument()
  })

  /** F20 R10: handing over from a reloaded result still starts the next person. */
  it('hands over to the next player from a reloaded result', async () => {
    fetchIdentityMock.mockResolvedValue(alreadySpun())
    const user = userEvent.setup()

    render(<PlayerPage />)
    await screen.findByTestId('spin-result')

    await user.click(screen.getByTestId('next-player-button'))

    expect(await screen.findByTestId('identity-phone')).toBeInTheDocument()
    expect(screen.queryByTestId('spin-result')).not.toBeInTheDocument()
    expect(forgetPlayerMock).toHaveBeenCalledOnce()
  })

  /**
   * F20 R2, and section 10's last row. A second tab still holds a Spin
   * button; pressing it is answered with a 409, and the page recovers by
   * asking the server what it knows rather than showing an error about it.
   */
  it('shows the result it already won when the server says the spin is used', async () => {
    const user = await renderPlayer()

    spinMock.mockRejectedValue(new ApiError('already spun', 409))
    fetchIdentityMock.mockResolvedValue(alreadySpun('Free gift'))

    await user.click(screen.getByTestId('spin-button'))

    const panel = await screen.findByTestId('spin-result')

    expect(panel).toHaveTextContent('Free gift')
    expect(screen.queryByTestId('spin-button')).not.toBeInTheDocument()
  })

  /**
   * F36 section 13. The recovery above re-reads everything, and that read
   * used to turn any failure of the identity request into "nobody is
   * identified" — which threw the player out of a game they were in the
   * middle of because a stall's wifi dropped one request.
   *
   * A 403 means nobody. A dropped connection means we could not ask.
   */
  it('keeps the player when the identity check could not be made', async () => {
    const user = await renderPlayer()

    spinMock.mockRejectedValue(new ApiError('already spun', 409))
    fetchIdentityMock.mockRejectedValue(new Error('the network went away'))

    await user.click(screen.getByTestId('spin-button'))

    await waitFor(() => expect(fetchIdentityMock).toHaveBeenCalledTimes(2))

    expect(screen.queryByTestId('identity-phone')).not.toBeInTheDocument()
    expect(screen.getByTestId('player-identity')).toBeInTheDocument()
  })
})

describe('identifying the player', () => {
  /** F08 R1 */
  it('asks for a phone number and offers no wheel at all', async () => {
    fetchIdentityMock.mockResolvedValue(NOBODY)

    render(<PlayerPage />)

    expect(await screen.findByTestId('identity-phone')).toBeInTheDocument()
    expect(screen.queryByTestId('spin-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('wheel-preview')).not.toBeInTheDocument()
  })

  /** F08 R1 — the branding is still the first thing read (F04) */
  it('keeps the campaign header on the identity step', async () => {
    fetchIdentityMock.mockResolvedValue(NOBODY)
    fetchWheelMock.mockResolvedValue(wheel({ campaignName: 'Noel', companyName: 'AA Store' }))

    render(<PlayerPage />)

    await screen.findByTestId('identity-phone')

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Noel')
    expect(screen.getByTestId('player-company')).toHaveTextContent('AA Store')
  })

  /** F08 R13 */
  it('goes straight to the wheel when the server already knows the visitor', async () => {
    fetchIdentityMock.mockResolvedValue(IDENTIFIED)

    render(<PlayerPage />)

    expect(await screen.findByTestId('wheel-preview')).toBeInTheDocument()
    expect(screen.queryByTestId('identity-phone')).not.toBeInTheDocument()
    expect(screen.getByTestId('player-identity')).toHaveTextContent('Playing as Anh')
  })

  /** F08 R5 — a known number asks nothing further */
  it('shows the wheel for a number the server recognises', async () => {
    fetchIdentityMock.mockResolvedValue(NOBODY)
    identifyPhoneMock.mockResolvedValue(KNOWN_NUMBER)

    const user = userEvent.setup()
    render(<PlayerPage />)
    await screen.findByTestId('identity-phone')

    await user.type(screen.getByTestId('phone-input'), '0912 345 678')
    await user.click(screen.getByTestId('phone-submit'))

    expect(await screen.findByTestId('wheel-preview')).toBeInTheDocument()
    expect(identifyPhoneMock).toHaveBeenCalledWith('0912 345 678')
    expect(registerPlayerMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('identity-details')).not.toBeInTheDocument()
  })

  /** F08 R6 */
  it('asks for a name and a birthday for a number it has not seen', async () => {
    fetchIdentityMock.mockResolvedValue(NOBODY)
    identifyPhoneMock.mockResolvedValue(UNKNOWN_NUMBER)

    const user = userEvent.setup()
    render(<PlayerPage />)
    await screen.findByTestId('identity-phone')

    await user.type(screen.getByTestId('phone-input'), '0912345678')
    await user.click(screen.getByTestId('phone-submit'))

    expect(await screen.findByTestId('identity-details')).toBeInTheDocument()
    expect(screen.getByTestId('first-name-input')).toBeInTheDocument()
    expect(screen.getByTestId('last-name-input')).toBeInTheDocument()
    expect(screen.getByTestId('birth-day-input')).toBeInTheDocument()
    expect(screen.getByTestId('birth-month-input')).toBeInTheDocument()

    // Still no wheel: unknown is not identified (F08 R1).
    expect(screen.queryByTestId('spin-button')).not.toBeInTheDocument()
  })

  /**
   * A mistyped digit is far cheaper to notice before a name is attached to it
   * than after it has become a player nobody can find again.
   */
  it('shows the number being registered on the details step', async () => {
    fetchIdentityMock.mockResolvedValue(NOBODY)
    identifyPhoneMock.mockResolvedValue(UNKNOWN_NUMBER)

    const user = userEvent.setup()
    render(<PlayerPage />)
    await screen.findByTestId('identity-phone')

    await user.type(screen.getByTestId('phone-input'), '0912345678')
    await user.click(screen.getByTestId('phone-submit'))

    expect(await screen.findByTestId('identity-details')).toHaveTextContent('0912345678')
  })

  /** F08 R6 — and then the wheel */
  it('registers the details and shows the wheel', async () => {
    fetchIdentityMock.mockResolvedValue(NOBODY)
    identifyPhoneMock.mockResolvedValue(UNKNOWN_NUMBER)
    registerPlayerMock.mockResolvedValue(REGISTERED)

    const user = userEvent.setup()
    render(<PlayerPage />)
    await screen.findByTestId('identity-phone')

    await user.type(screen.getByTestId('phone-input'), '0912345678')
    await user.click(screen.getByTestId('phone-submit'))
    await screen.findByTestId('identity-details')

    await user.type(screen.getByTestId('first-name-input'), 'Anh')
    await user.type(screen.getByTestId('last-name-input'), 'Le')
    await user.selectOptions(screen.getByTestId('birth-day-input'), '12')
    await user.selectOptions(screen.getByTestId('birth-month-input'), '3')
    await user.click(screen.getByTestId('details-submit'))

    // F34 R7, R10. Their card, once, on the way to the game.
    await user.click(await screen.findByTestId('card-continue'))

    expect(await screen.findByTestId('wheel-preview')).toBeInTheDocument()

    // F08 R3: the server's canonical number is what gets registered, not the
    // string the player typed.
    expect(registerPlayerMock).toHaveBeenCalledWith({
      phone: '0912345678',
      firstName: 'Anh',
      lastName: 'Le',
      // F38 R1. Two numbers, and nothing that says an age.
      birthDay: 12,
      birthMonth: 3,
    })
  })

  /** F34 R7, R11. The barcode, and the code under it as F33 R3 has it. */
  it('shows a new customer their card', async () => {
    fetchIdentityMock.mockResolvedValue(NOBODY)
    identifyPhoneMock.mockResolvedValue(UNKNOWN_NUMBER)
    registerPlayerMock.mockResolvedValue(REGISTERED)

    const user = userEvent.setup()
    render(<PlayerPage />)
    await screen.findByTestId('identity-phone')

    await user.type(screen.getByTestId('phone-input'), '0912345678')
    await user.click(screen.getByTestId('phone-submit'))
    await screen.findByTestId('identity-details')

    await user.type(screen.getByTestId('first-name-input'), 'Anh')
    await user.type(screen.getByTestId('last-name-input'), 'Le')
    await user.selectOptions(screen.getByTestId('birth-day-input'), '12')
    await user.selectOptions(screen.getByTestId('birth-month-input'), '3')
    await user.click(screen.getByTestId('details-submit'))

    expect(await screen.findByTestId('identity-card')).toBeInTheDocument()
    expect(screen.getByTestId('customer-card')).toHaveTextContent('M9PXK-4T7VH')
    expect(screen.getByRole('img')).toHaveAccessibleName('M9PXK-4T7VH')
    // R10: it is a step on the way, not a screen the game waits behind.
    expect(screen.queryByTestId('wheel-preview')).not.toBeInTheDocument()

    /*
     * F36 section 13. The way on has to look like the way on. This button
     * shipped with the shape of the game's button and none of its paint, so
     * it rendered as a line of body text on a transparent background and
     * customers did not see it.
     */
    const onwards = screen.getByTestId('card-continue')

    expect(onwards.style.backgroundColor).toBe('var(--button-bg)')
    expect(onwards.style.color).toBe('var(--button-text)')
  })

  /**
   * F34 R8. Anybody may type anybody's number into a stall phone, so a
   * returning customer is shown nothing — the server sends no card, and
   * there is no request that would ask for one.
   */
  it('shows no card to a customer who already existed', async () => {
    fetchIdentityMock.mockResolvedValue(NOBODY)
    identifyPhoneMock.mockResolvedValue(UNKNOWN_NUMBER)
    registerPlayerMock.mockResolvedValue({ ...REGISTERED, card: null })

    const user = userEvent.setup()
    render(<PlayerPage />)
    await screen.findByTestId('identity-phone')

    await user.type(screen.getByTestId('phone-input'), '0912345678')
    await user.click(screen.getByTestId('phone-submit'))
    await screen.findByTestId('identity-details')

    await user.type(screen.getByTestId('first-name-input'), 'Anh')
    await user.type(screen.getByTestId('last-name-input'), 'Le')
    await user.selectOptions(screen.getByTestId('birth-day-input'), '12')
    await user.selectOptions(screen.getByTestId('birth-month-input'), '3')
    await user.click(screen.getByTestId('details-submit'))

    expect(await screen.findByTestId('wheel-preview')).toBeInTheDocument()
    expect(screen.queryByTestId('identity-card')).not.toBeInTheDocument()
  })

  it('lets the player go back and change the number', async () => {
    fetchIdentityMock.mockResolvedValue(NOBODY)
    identifyPhoneMock.mockResolvedValue(UNKNOWN_NUMBER)

    const user = userEvent.setup()
    render(<PlayerPage />)
    await screen.findByTestId('identity-phone')

    await user.type(screen.getByTestId('phone-input'), '0912345678')
    await user.click(screen.getByTestId('phone-submit'))
    await screen.findByTestId('identity-details')

    await user.click(screen.getByTestId('change-number'))

    expect(await screen.findByTestId('identity-phone')).toBeInTheDocument()
  })

  /** F08 R4 — checked here first, so an unusable number costs no round trip */
  it('rejects a number that is too short without asking the server', async () => {
    fetchIdentityMock.mockResolvedValue(NOBODY)

    const user = userEvent.setup()
    render(<PlayerPage />)
    await screen.findByTestId('identity-phone')

    await user.type(screen.getByTestId('phone-input'), '123')
    await user.click(screen.getByTestId('phone-submit'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/does not look like a phone number/i)
    expect(identifyPhoneMock).not.toHaveBeenCalled()
  })

  it('asks for a number when the field is empty', async () => {
    fetchIdentityMock.mockResolvedValue(NOBODY)

    const user = userEvent.setup()
    render(<PlayerPage />)
    await screen.findByTestId('identity-phone')

    await user.click(screen.getByTestId('phone-submit'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter your phone number/i)
    expect(identifyPhoneMock).not.toHaveBeenCalled()
  })

  /** F08 R10 — every problem at once, not one per submission */
  it('reports all three missing details together', async () => {
    fetchIdentityMock.mockResolvedValue(NOBODY)
    identifyPhoneMock.mockResolvedValue(UNKNOWN_NUMBER)

    const user = userEvent.setup()
    render(<PlayerPage />)
    await screen.findByTestId('identity-phone')

    await user.type(screen.getByTestId('phone-input'), '0912345678')
    await user.click(screen.getByTestId('phone-submit'))
    await screen.findByTestId('identity-details')

    await user.click(screen.getByTestId('details-submit'))

    const alerts = await screen.findAllByRole('alert')

    expect(alerts).toHaveLength(3)
    expect(registerPlayerMock).not.toHaveBeenCalled()
  })

  it('keeps what was typed when the server rejects the details', async () => {
    fetchIdentityMock.mockResolvedValue(NOBODY)
    identifyPhoneMock.mockResolvedValue(UNKNOWN_NUMBER)
    registerPlayerMock.mockRejectedValue(
      new ApiValidationError('nope', [{ field: 'firstName', message: 'Server says no.' }]),
    )

    const user = userEvent.setup()
    render(<PlayerPage />)
    await screen.findByTestId('identity-phone')

    await user.type(screen.getByTestId('phone-input'), '0912345678')
    await user.click(screen.getByTestId('phone-submit'))
    await screen.findByTestId('identity-details')

    await user.type(screen.getByTestId('first-name-input'), 'Anh')
    await user.type(screen.getByTestId('last-name-input'), 'Le')
    await user.selectOptions(screen.getByTestId('birth-day-input'), '12')
    await user.selectOptions(screen.getByTestId('birth-month-input'), '3')
    await user.click(screen.getByTestId('details-submit'))

    expect(await screen.findByText('Server says no.')).toBeInTheDocument()
    expect(screen.getByTestId('first-name-input')).toHaveValue('Anh')
    expect(screen.getByTestId('last-name-input')).toHaveValue('Le')
  })

  it('reports a failed lookup and lets the player try again', async () => {
    fetchIdentityMock.mockResolvedValue(NOBODY)
    identifyPhoneMock.mockRejectedValueOnce(new ApiError('offline', 500))

    const user = userEvent.setup()
    render(<PlayerPage />)
    await screen.findByTestId('identity-phone')

    await user.type(screen.getByTestId('phone-input'), '0912345678')
    await user.click(screen.getByTestId('phone-submit'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not check that number/i)

    identifyPhoneMock.mockResolvedValue(KNOWN_NUMBER)
    await user.click(screen.getByTestId('phone-submit'))

    expect(await screen.findByTestId('wheel-preview')).toBeInTheDocument()
  })

  /**
   * A failing identity check is not a failing page: it leaves the visitor
   * unidentified, which is the phone step, which works.
   */
  it('shows the phone step when the identity check itself fails', async () => {
    fetchIdentityMock.mockRejectedValue(new ApiError('offline', 500))

    render(<PlayerPage />)

    expect(await screen.findByTestId('identity-phone')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  /** Only the wheel failing means there is no game to show. */
  it('still reports a failed wheel even when the identity is known', async () => {
    fetchIdentityMock.mockResolvedValue(IDENTIFIED)
    fetchWheelMock.mockRejectedValue(new ApiError('nope', 500))

    render(<PlayerPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i)
  })

  /** F08 R12: the wheel and the identity are asked for together, not in series */
  it('asks for the wheel and the identity in one pass', async () => {
    render(<PlayerPage />)
    await screen.findByTestId('wheel-preview')

    expect(fetchWheelMock).toHaveBeenCalled()
    expect(fetchIdentityMock).toHaveBeenCalled()
  })
})

/** F08 R14 */
describe('being somebody else', () => {
  it('returns to the phone step and tells the server to forget', async () => {
    const user = await renderPlayer()

    await user.click(screen.getByTestId('forget-player'))

    expect(await screen.findByTestId('identity-phone')).toBeInTheDocument()
    expect(screen.queryByTestId('spin-button')).not.toBeInTheDocument()
    await waitFor(() => expect(forgetPlayerMock).toHaveBeenCalledOnce())
  })

  /**
   * The person handing a stall phone over must see the last player's name
   * gone at once; a failed call leaves a server session that the next
   * identification simply replaces.
   */
  it('still forgets locally when the server call fails', async () => {
    forgetPlayerMock.mockRejectedValue(new ApiError('offline', 500))

    const user = await renderPlayer()

    await user.click(screen.getByTestId('forget-player'))

    expect(await screen.findByTestId('identity-phone')).toBeInTheDocument()
  })

  it('clears a result that was on screen', async () => {
    spinMock.mockResolvedValue(result(0))
    const user = await renderPlayer()

    await user.click(screen.getByTestId('spin-button'))
    await waitFor(() => expect(spinMock).toHaveBeenCalledOnce())
    finishTheSpin()
    await screen.findByTestId('spin-result')

    // Reached through the hand-over now (F10 R9): with a result up, "Not
    // you?" is gone and "Next player" is the one control that does this.
    await user.click(screen.getByTestId('next-player-button'))

    expect(await screen.findByTestId('identity-phone')).toBeInTheDocument()
    expect(screen.queryByTestId('spin-result')).not.toBeInTheDocument()
    await waitFor(() => expect(forgetPlayerMock).toHaveBeenCalledOnce())
  })
})

/** F13 R20 with F16 R1, R2, R6: the code the player quotes at the counter. */
describe('the code on the result', () => {
  async function spinTo(reward: Partial<SpinReward>) {
    spinMock.mockResolvedValue(result(2, reward))
    const user = await renderPlayer()

    await user.click(screen.getByTestId('spin-button'))
    await waitFor(() => expect(spinMock).toHaveBeenCalledOnce())
    finishTheSpin()
    await screen.findByTestId('spin-result')

    return user
  }

  it('shows the code for a discount', async () => {
    await spinTo({ type: 'percent_off', value: 10, code: 'A7K3-M9PX' })

    expect(screen.getByTestId('reward-code')).toHaveTextContent('A7K3-M9PX')
    expect(screen.getByTestId('reward-code')).toHaveTextContent('Your code')
  })

  /** F16 R1, R6a: a free product carries one now, and says to give it. */
  it('shows the code for a free product', async () => {
    await spinTo({ type: 'free_product', value: null, code: 'B4C5-D6F7' })

    expect(screen.getByTestId('reward-code')).toHaveTextContent('B4C5-D6F7')
    expect(screen.getByTestId('spin-result')).toHaveTextContent(/give this code/i)
    // The instruction F10 made untrue is gone wherever there is a code.
    expect(screen.getByTestId('spin-result')).not.toHaveTextContent(/show this screen/i)
  })

  /** F16 R2 */
  it('shows no code for a losing item', async () => {
    await spinTo({ type: 'nothing', value: null, code: null })

    expect(screen.queryByTestId('reward-code')).not.toBeInTheDocument()
  })

  /** F33 R11. The label, the bars, then the characters. */
  it('shows the code as a barcode above the characters', async () => {
    await spinTo({ type: 'percent_off', value: 10, code: 'A7K3-M9PX' })

    const panel = screen.getByTestId('reward-code')
    const order = [...panel.children].map(
      (child) => child.getAttribute('data-testid') ?? child.textContent,
    )

    expect(order).toEqual(['Your code', 'reward-barcode', 'A7K3-M9PX'])
  })

  /*
   * R3. The characters are not decoration under the bars: they are what the
   * counter types when the scan will not take, which is the whole reason
   * this feature keeps them. Asserted apart from the order above so that
   * removing them later fails a test that says why.
   */
  it('keeps the characters readable under the barcode', async () => {
    await spinTo({ type: 'free_product', value: null, code: 'B4C5-D6F7' })

    expect(screen.getByTestId('reward-barcode')).toBeInTheDocument()
    expect(screen.getByTestId('reward-code')).toHaveTextContent('B4C5-D6F7')
  })

  /** R13. Nothing to claim, so nothing to scan. */
  it('shows no barcode for a losing item', async () => {
    await spinTo({ type: 'nothing', value: null, code: null })

    expect(screen.queryByTestId('reward-barcode')).not.toBeInTheDocument()
  })

  /** R14. A win from before F16 has no code to encode. */
  it('shows no barcode for a win that has no code', async () => {
    await spinTo({ type: 'free_product', value: null, code: null })

    expect(screen.queryByTestId('reward-barcode')).not.toBeInTheDocument()
  })

  /** F17: the panel a player reads when the wheel gave nothing. */
  describe('losing', () => {
    it('neither congratulates them nor sends them to a counter', async () => {
      await spinTo({ type: 'nothing', value: null, code: null })

      const panel = screen.getByTestId('spin-result')

      // F17 R2, R3. Every one of these was on the losing panel before this
      // feature, and F13 R24 means the last one sent people to a counter
      // that is not even offered the control to serve them.
      expect(panel).not.toHaveTextContent(/you won/i)
      expect(panel).not.toHaveTextContent(/show this screen/i)
      expect(panel).not.toHaveTextContent(/give this code/i)
    })

    it('thanks them, says where the wheel stopped, and wishes them luck', async () => {
      await spinTo({ type: 'nothing', value: null, code: null })

      const panel = screen.getByTestId('spin-result')

      expect(panel).toHaveTextContent('Thanks for playing')
      // F17 R4: the slice's own name, as the admin typed it (F12 R10). The
      // fixture's label has nothing to do with the reward behind it, which
      // is exactly the point — the panel shows what the admin wrote, not a
      // phrase derived from the reward type.
      expect(panel).toHaveTextContent(wheel().prizes[2].name)
      expect(panel).toHaveTextContent('Good luck next time!')
    })

    it('leaves a win word for word as it was', async () => {
      await spinTo({ type: 'free_product', value: null, code: 'B4C5-D6F7' })

      const panel = screen.getByTestId('spin-result')

      expect(panel).toHaveTextContent('You won')
      expect(panel).toHaveTextContent(/give this code/i)
      expect(panel).not.toHaveTextContent('Thanks for playing')
      expect(panel).not.toHaveTextContent('Good luck next time!')
    })
  })

  /** F10 R3: the hand-over clears the code with the prize. */
  it('clears the code when the device is handed on', async () => {
    const user = await spinTo({ type: 'percent_off', value: 10, code: 'A7K3-M9PX' })

    await user.click(screen.getByTestId('next-player-button'))
    await screen.findByTestId('identity-phone')

    expect(screen.queryByTestId('reward-code')).not.toBeInTheDocument()
  })
})

/** F10 — handing the device to the next player. */
describe('handing over after a result', () => {
  async function spinToAResult() {
    spinMock.mockResolvedValue(result(2))
    const user = await renderPlayer()

    await user.click(screen.getByTestId('spin-button'))
    await waitFor(() => expect(spinMock).toHaveBeenCalledOnce())
    finishTheSpin()
    await screen.findByTestId('spin-result')

    return user
  }

  /** F10 R5 — the prize is the player's proof; only a press clears it */
  it('keeps the prize on screen until the button is pressed', async () => {
    await spinToAResult()

    expect(screen.getByTestId('spin-result')).toHaveTextContent('Free gift')
    expect(screen.getByTestId('next-player-button')).toBeInTheDocument()
  })

  /** F10 R3 */
  it('returns to the phone step and clears the prize', async () => {
    const user = await spinToAResult()

    await user.click(screen.getByTestId('next-player-button'))

    expect(await screen.findByTestId('identity-phone')).toBeInTheDocument()
    expect(screen.queryByTestId('spin-result')).not.toBeInTheDocument()
    expect(screen.queryByTestId('next-player-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('wheel-preview')).not.toBeInTheDocument()
  })

  /**
   * F10 R4. Clearing only the page would leave a reload putting the next
   * person back on the previous player's identity — and able to spin as them.
   */
  it('tells the server to forget the player', async () => {
    const user = await spinToAResult()

    await user.click(screen.getByTestId('next-player-button'))

    await waitFor(() => expect(forgetPlayerMock).toHaveBeenCalledOnce())
  })

  it('hands over anyway when the forget request fails', async () => {
    forgetPlayerMock.mockRejectedValue(new ApiError('offline', 500))

    const user = await spinToAResult()

    await user.click(screen.getByTestId('next-player-button'))

    expect(await screen.findByTestId('identity-phone')).toBeInTheDocument()
  })

  /** F10 R3 — the wheel is back at rest for whoever is next */
  it('returns the wheel to rest', async () => {
    const user = await spinToAResult()

    await user.click(screen.getByTestId('next-player-button'))
    await screen.findByTestId('identity-phone')

    identifyPhoneMock.mockResolvedValue({ ...KNOWN_NUMBER, phone: '0987654321' })
    await user.type(screen.getByTestId('phone-input'), '0987654321')
    await user.click(screen.getByTestId('phone-submit'))

    await screen.findByTestId('wheel-preview')

    expect(phase()).toBe('idle')
    expect(Number(screen.getByTestId('wheel-preview').dataset.rotation)).toBe(0)
  })

  /**
   * F10 R6. The rare case the user asked about: the same person playing
   * twice. The phone number is the identity, so they are recognised and
   * asked nothing further (F08 R5).
   */
  it('recognises the same number coming straight back', async () => {
    const user = await spinToAResult()

    await user.click(screen.getByTestId('next-player-button'))
    await screen.findByTestId('identity-phone')

    identifyPhoneMock.mockResolvedValue(KNOWN_NUMBER)
    await user.type(screen.getByTestId('phone-input'), '0912345678')
    await user.click(screen.getByTestId('phone-submit'))

    expect(await screen.findByTestId('spin-button')).toBeEnabled()
    // No name, no birthday: the number was enough.
    expect(screen.queryByTestId('identity-details')).not.toBeInTheDocument()
    expect(registerPlayerMock).not.toHaveBeenCalled()
  })

  /**
   * F10 R10. A player who did not get a spin is not handed over — the device
   * is still theirs, and the button is still Spin.
   */
  it('does not hand over after a failed spin', async () => {
    spinMock.mockRejectedValue(new ApiError('boom', 500))
    const user = await renderPlayer()

    await user.click(screen.getByTestId('spin-button'))
    await screen.findByRole('alert')

    expect(screen.getByTestId('spin-button')).toHaveTextContent('Spin')
    expect(screen.getByTestId('spin-button')).toBeEnabled()
    expect(screen.queryByTestId('next-player-button')).not.toBeInTheDocument()
    expect(screen.getByTestId('forget-player')).toBeInTheDocument()
    expect(forgetPlayerMock).not.toHaveBeenCalled()
  })
})

/**
 * F08 R16. A 403 means the server will not say who this is any more — a
 * lapsed session, or a player deleted between loading the page and pressing
 * Spin. Leaving the wheel up with an error would offer a button that can
 * never work again.
 */
describe('when the spin is refused', () => {
  it('returns to the phone step and says why', async () => {
    spinMock.mockRejectedValue(new ApiError('Tell us who you are before you spin.', 403))
    const user = await renderPlayer()

    await user.click(screen.getByTestId('spin-button'))

    expect(await screen.findByTestId('identity-phone')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/who is playing/i)
    expect(screen.queryByTestId('spin-result')).not.toBeInTheDocument()
  })

  it('keeps the wheel up for an ordinary failure', async () => {
    spinMock.mockRejectedValue(new ApiError('boom', 500))
    const user = await renderPlayer()

    await user.click(screen.getByTestId('spin-button'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be completed/i)
    expect(screen.getByTestId('spin-button')).toBeInTheDocument()
    expect(screen.queryByTestId('identity-phone')).not.toBeInTheDocument()
  })

  it('clears the message once the player identifies again', async () => {
    spinMock.mockRejectedValue(new ApiError('nope', 403))
    identifyPhoneMock.mockResolvedValue(KNOWN_NUMBER)

    const user = await renderPlayer()
    await user.click(screen.getByTestId('spin-button'))
    await screen.findByTestId('identity-phone')

    await user.type(screen.getByTestId('phone-input'), '0912345678')
    await user.click(screen.getByTestId('phone-submit'))

    expect(await screen.findByTestId('wheel-preview')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

/**
 * F23 — the person has had their spins for today.
 *
 * The page never counts anything itself: every number here came from the
 * server (F23 R3), which is why these tests set it on the answer rather
 * than on the page.
 */
describe('a day that has been used up', () => {
  const exhausted = { ...IDENTIFIED, spinsLeft: 0 }

  /** F23 R14 */
  it('shows the already-played screen instead of the wheel', async () => {
    fetchIdentityMock.mockResolvedValue(exhausted)

    render(<PlayerPage />)

    expect(await screen.findByTestId('spins-exhausted')).toHaveTextContent(/already played today/i)
    expect(screen.queryByTestId('wheel-preview')).not.toBeInTheDocument()
  })

  /** F23 R14: not a disabled button — no button (F10 R8's rule). */
  it('leaves no spin control in the document', async () => {
    fetchIdentityMock.mockResolvedValue(exhausted)

    render(<PlayerPage />)
    await screen.findByTestId('spins-exhausted')

    expect(screen.queryByTestId('spin-button')).not.toBeInTheDocument()
  })

  /**
   * F23 R15. The one that matters: anybody may type anybody's number into a
   * stall phone, so this screen is shown to whoever typed it.
   */
  it('says nothing about what they won or how often they played', async () => {
    fetchIdentityMock.mockResolvedValue(exhausted)

    render(<PlayerPage />)
    await screen.findByTestId('spins-exhausted')

    expect(screen.queryByTestId('spin-result')).not.toBeInTheDocument()
    expect(screen.queryByTestId('reward-code')).not.toBeInTheDocument()

    const page = screen.getByTestId('player-screen')

    expect(page).not.toHaveTextContent('A7K3-M9PX')
    expect(page).not.toHaveTextContent('Free sample')
  })

  /** F23 R18: and nothing about the campaign's rule either. */
  it('never states the limit', async () => {
    fetchIdentityMock.mockResolvedValue({ ...IDENTIFIED, spinsLeft: 0 })

    render(<PlayerPage />)
    await screen.findByTestId('spins-exhausted')

    // The only numeral that belongs on this screen is none of them.
    expect(screen.getByTestId('player-screen').textContent).not.toMatch(/\d/)
  })

  /** F23 R16: the queue behind them has to be able to play. */
  it('hands the device on to the next customer', async () => {
    fetchIdentityMock.mockResolvedValue(exhausted)

    const user = userEvent.setup()
    render(<PlayerPage />)
    await screen.findByTestId('spins-exhausted')

    // F29 R2: one label, on this screen as on the result.
    expect(screen.getByTestId('next-player-button')).toHaveTextContent('Next customer')

    fetchIdentityMock.mockResolvedValue(NOBODY)
    await user.click(screen.getByTestId('next-player-button'))

    expect(await screen.findByTestId('identity-phone')).toBeInTheDocument()
    expect(forgetPlayerMock).toHaveBeenCalledOnce()
  })

  /**
   * F23 R14 against F20 R6. Somebody who has just used their last spin has
   * both an empty day and a prize to read, and the prize wins — otherwise
   * winning the last spin of the day would make the code vanish.
   */
  it('still shows a result won in this session', async () => {
    fetchIdentityMock.mockResolvedValue({ ...alreadySpun('Free gift'), spinsLeft: 0 })

    render(<PlayerPage />)

    expect(await screen.findByTestId('spin-result')).toHaveTextContent('Free gift')
    expect(screen.getByTestId('reward-code')).toHaveTextContent('A7K3-M9PX')
    expect(screen.queryByTestId('spins-exhausted')).not.toBeInTheDocument()
  })

  /** F23 R19: one spin left is not an exhausted day. */
  it('shows the wheel while a spin remains', async () => {
    fetchIdentityMock.mockResolvedValue({ ...IDENTIFIED, spinsLeft: 1 })

    render(<PlayerPage />)

    expect(await screen.findByTestId('wheel-preview')).toBeInTheDocument()
    expect(screen.getByTestId('spin-button')).toBeInTheDocument()
    expect(screen.queryByTestId('spins-exhausted')).not.toBeInTheDocument()
  })

  /** F23 R1: and nor is a campaign with no limit at all. */
  it('shows the wheel when the campaign has no limit', async () => {
    fetchIdentityMock.mockResolvedValue({ ...IDENTIFIED, spinsLeft: null })

    render(<PlayerPage />)

    expect(await screen.findByTestId('wheel-preview')).toBeInTheDocument()
  })

  /**
   * F23 R13. The answer arrives with the identification, so somebody who
   * has used their day is never offered a wheel to press.
   */
  it('appears as soon as an exhausted person identifies', async () => {
    fetchIdentityMock.mockResolvedValue(NOBODY)
    identifyPhoneMock.mockResolvedValue({ ...KNOWN_NUMBER, spinsLeft: 0 })

    const user = userEvent.setup()
    render(<PlayerPage />)
    await screen.findByTestId('identity-phone')

    await user.type(screen.getByTestId('phone-input'), '0912345678')
    await user.click(screen.getByTestId('phone-submit'))

    expect(await screen.findByTestId('spins-exhausted')).toBeInTheDocument()
    expect(screen.queryByTestId('wheel-preview')).not.toBeInTheDocument()
  })

  /**
   * F23 R10, R11. A tab left open since before the day was used up: the
   * refusal is recovered from rather than shown as a failure.
   */
  it('recovers from a 429 by re-asking the server', async () => {
    spinMock.mockRejectedValue(new ApiError('too many', 429))

    const user = await renderPlayer()

    fetchIdentityMock.mockResolvedValue(exhausted)
    await user.click(screen.getByTestId('spin-button'))

    expect(await screen.findByTestId('spins-exhausted')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

/**
 * F27 R24, R25, R26: the two pages with no game on them.
 *
 * Both are deliberately plain — no company name, no logo, no theme — and the
 * first two tests here are the ones that matter: a promotion that has ended
 * and a key that never existed have to be the same page, because anything
 * that tells them apart lets somebody enumerate a shop's promotions.
 */
describe('a link with no game behind it', () => {
  function renderAtKey(key = 'q7mfd2xkbnrt') {
    render(
      <MemoryRouter initialEntries={[`/play/${key}`]}>
        <Routes>
          <Route path="/play/:key" element={<PlayerPage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('says the promotion has ended when the key does not resolve', async () => {
    resolvePlayMock.mockRejectedValue(new ApiError('no_such_game', 404))
    renderAtKey()

    expect(await screen.findByTestId('promotion-ended')).toHaveTextContent(/has ended/i)
  })

  it('carries no company name, no logo and no theme on that page', async () => {
    resolvePlayMock.mockRejectedValue(new ApiError('no_such_game', 404))
    renderAtKey()

    await screen.findByTestId('promotion-ended')

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByText(/AA Store/i)).not.toBeInTheDocument()
  })

  it('never asks for the wheel when the key does not resolve', async () => {
    resolvePlayMock.mockRejectedValue(new ApiError('no_such_game', 404))
    renderAtKey()

    await screen.findByTestId('promotion-ended')

    expect(fetchWheelMock).not.toHaveBeenCalled()
  })

  /** F27 R20: resolving the key is what binds the session to the game. */
  it('resolves the key before asking for anything else', async () => {
    resolvePlayMock.mockResolvedValue({ type: 'wheel', branding: wheel().branding })
    renderAtKey('abcdefghijkm')

    await screen.findByTestId('wheel-preview')

    expect(resolvePlayMock).toHaveBeenCalledWith('abcdefghijkm', expect.anything())
  })

  /** F27 R26: `/` with nothing to serve asks for the link instead. */
  it('asks for a link when the server has no game to serve', async () => {
    fetchWheelMock.mockRejectedValue(new ApiError('no_game', 409))
    render(<PlayerPage />)

    expect(await screen.findByTestId('needs-link')).toHaveTextContent(/link is needed/i)
  })

  /** Any other failure is still a failure, with a retry (F01 section 9). */
  it('still offers a retry when the server breaks', async () => {
    fetchWheelMock.mockRejectedValue(new ApiError('boom', 500))
    render(<PlayerPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i)
  })
})

/**
 * F40 — the note under the phone field.
 *
 * The rules themselves are tested as a pure function in `identity.test.ts`.
 * What is tested here is the part that function cannot show: that the note
 * waits for the player to finish typing (R14), that it looks like something
 * to read rather than something that went wrong (R12), and — the one that
 * matters most — that it never stops the step (R10).
 */
describe('a number that does not look French (F40)', () => {
  /**
   * The language set the way a player sets it (F12 R7), through the real
   * provider, rather than by mocking the hook: this feature reads the
   * locale and nothing else, so the locale is the thing worth getting
   * honestly.
   */
  async function renderIn(locale: 'en' | 'fr') {
    localStorage.setItem(STORAGE_KEY, locale)
    fetchIdentityMock.mockResolvedValue(NOBODY)
    identifyPhoneMock.mockResolvedValue(KNOWN_NUMBER)

    const user = userEvent.setup()
    render(
      <I18nProvider>
        <PlayerPage />
      </I18nProvider>,
    )
    await screen.findByTestId('identity-phone')

    return user
  }

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY)
  })

  /** R1, R5, R14 */
  it('says the number does not look French once the field is left', async () => {
    const user = await renderIn('fr')

    await user.type(screen.getByTestId('phone-input'), '061485624')
    await user.tab()

    expect(await screen.findByTestId('phone-input-note')).toHaveTextContent(
      /ne ressemble pas à un numéro français/i,
    )
  })

  /**
   * R10. The whole feature, in one test. If this ever fails, the note has
   * become the gate F08 §13 spent a paragraph refusing to build.
   */
  it('lets the number through anyway', async () => {
    const user = await renderIn('fr')

    await user.type(screen.getByTestId('phone-input'), '061485624')
    await user.click(screen.getByTestId('phone-submit'))

    expect(await screen.findByTestId('wheel-preview')).toBeInTheDocument()
    expect(identifyPhoneMock).toHaveBeenCalledWith('061485624')
  })

  /** R14. Every number is wrong halfway through being typed. */
  it('says nothing while the digits are still arriving', async () => {
    const user = await renderIn('fr')

    await user.type(screen.getByTestId('phone-input'), '0614')

    expect(screen.queryByTestId('phone-input-note')).not.toBeInTheDocument()
  })

  /**
   * R14. Continue counts as finishing with the field too — seen here on a
   * lookup that failed, because that is when the step is still on screen
   * afterwards to be read. When the lookup succeeds the step advances and
   * the note goes with it, which is R10 working as intended: see F40 §13.
   */
  it('shows the note when the step is still there after Continue', async () => {
    const user = await renderIn('fr')
    identifyPhoneMock.mockRejectedValue(new ApiError('offline', 500))

    await user.type(screen.getByTestId('phone-input'), '061485624')
    await user.click(screen.getByTestId('phone-submit'))

    expect(await screen.findByTestId('phone-input-note')).toBeInTheDocument()
  })

  /** R14. And goes away again while the number is being corrected. */
  it('goes away when the number is edited', async () => {
    const user = await renderIn('fr')

    await user.type(screen.getByTestId('phone-input'), '061485624')
    await user.tab()
    await screen.findByTestId('phone-input-note')

    await user.type(screen.getByTestId('phone-input'), '0')

    expect(screen.queryByTestId('phone-input-note')).not.toBeInTheDocument()
  })

  /** R5. A number that does look French is not remarked upon. */
  it('says nothing about a French number', async () => {
    const user = await renderIn('fr')

    await user.type(screen.getByTestId('phone-input'), '06 14 85 62 40')
    await user.tab()

    expect(screen.queryByTestId('phone-input-note')).not.toBeInTheDocument()
  })

  /** R2. The person said where their number is from. */
  it('says nothing about a foreign number on a French page', async () => {
    const user = await renderIn('fr')

    await user.type(screen.getByTestId('phone-input'), '+84912345678')
    await user.tab()

    expect(screen.queryByTestId('phone-input-note')).not.toBeInTheDocument()
  })

  /** R3. An English page suggests no country at all. */
  it('says nothing on an English page', async () => {
    const user = await renderIn('en')

    await user.type(screen.getByTestId('phone-input'), '061485624')
    await user.tab()

    expect(screen.queryByTestId('phone-input-note')).not.toBeInTheDocument()
  })

  /** R1. Unless the number named France itself. */
  it('checks a +33 number on an English page', async () => {
    const user = await renderIn('en')

    await user.type(screen.getByTestId('phone-input'), '+3361485624')
    await user.tab()

    expect(await screen.findByTestId('phone-input-note')).toHaveTextContent(
      /does not look like a French number/i,
    )
  })

  /**
   * R12. Not an error: the body colour, and a status rather than an alert.
   * The colour is asserted as the token, because jsdom resolves no
   * custom properties — what matters is that it is not `--danger`.
   */
  it('reads as a remark and not as an error', async () => {
    const user = await renderIn('fr')

    await user.type(screen.getByTestId('phone-input'), '061485624')
    await user.tab()

    const note = await screen.findByTestId('phone-input-note')

    expect(note).toHaveAttribute('role', 'status')
    expect(note.style.color).toBe('var(--body)')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  /** R13. One problem at a time: F08's message wins the space. */
  it('leaves the field to F08 when the number is not a number', async () => {
    const user = await renderIn('fr')

    await user.type(screen.getByTestId('phone-input'), 'abc')
    await user.click(screen.getByTestId('phone-submit'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /ne ressemble pas à un numéro de téléphone/i,
    )
    expect(screen.queryByTestId('phone-input-note')).not.toBeInTheDocument()
  })
})
