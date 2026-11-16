import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, ApiValidationError } from '../api/client'
import {
  fetchIdentity,
  fetchPlayerWheel,
  forgetPlayer,
  identifyPhone,
  registerPlayer,
  spin,
  type PlayerWheel,
  type SpinReward,
} from '../api/player'
import { THEMES, THEME_NAMES } from '../branding/themes'
import { colourFor } from '../wheel/palette'
import { PlayerPage } from './PlayerPage'
import { sliceUnderPointer } from './rotation'

vi.mock('../api/player', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/player')>()),
  fetchPlayerWheel: vi.fn(),
  spin: vi.fn(),
  fetchIdentity: vi.fn(),
  identifyPhone: vi.fn(),
  registerPlayer: vi.fn(),
  forgetPlayer: vi.fn(),
}))

const fetchWheelMock = vi.mocked(fetchPlayerWheel)
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

const PRIZES = ['Try again', 'Free sample', 'Free gift', 'Grand prize']

const PLAIN_BRANDING = {
  companyName: null,
  campaignName: null,
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
  fetchIdentityMock.mockResolvedValue(PLAYER)
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

    expect(screen.getByTestId('next-player-button')).toHaveTextContent('Next player')

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
    identifyPhoneMock.mockResolvedValue({ known: true, phone: '0912345678', player: PLAYER })
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
describe('identifying the player', () => {
  /** F08 R1 */
  it('asks for a phone number and offers no wheel at all', async () => {
    fetchIdentityMock.mockResolvedValue(null)

    render(<PlayerPage />)

    expect(await screen.findByTestId('identity-phone')).toBeInTheDocument()
    expect(screen.queryByTestId('spin-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('wheel-preview')).not.toBeInTheDocument()
  })

  /** F08 R1 — the branding is still the first thing read (F04) */
  it('keeps the campaign header on the identity step', async () => {
    fetchIdentityMock.mockResolvedValue(null)
    fetchWheelMock.mockResolvedValue(wheel({ campaignName: 'Noel', companyName: 'AA Store' }))

    render(<PlayerPage />)

    await screen.findByTestId('identity-phone')

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Noel')
    expect(screen.getByTestId('player-company')).toHaveTextContent('AA Store')
  })

  /** F08 R13 */
  it('goes straight to the wheel when the server already knows the visitor', async () => {
    fetchIdentityMock.mockResolvedValue(PLAYER)

    render(<PlayerPage />)

    expect(await screen.findByTestId('wheel-preview')).toBeInTheDocument()
    expect(screen.queryByTestId('identity-phone')).not.toBeInTheDocument()
    expect(screen.getByTestId('player-identity')).toHaveTextContent('Playing as Anh')
  })

  /** F08 R5 — a known number asks nothing further */
  it('shows the wheel for a number the server recognises', async () => {
    fetchIdentityMock.mockResolvedValue(null)
    identifyPhoneMock.mockResolvedValue({ known: true, phone: '0912345678', player: PLAYER })

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
    fetchIdentityMock.mockResolvedValue(null)
    identifyPhoneMock.mockResolvedValue({ known: false, phone: '0912345678', player: null })

    const user = userEvent.setup()
    render(<PlayerPage />)
    await screen.findByTestId('identity-phone')

    await user.type(screen.getByTestId('phone-input'), '0912345678')
    await user.click(screen.getByTestId('phone-submit'))

    expect(await screen.findByTestId('identity-details')).toBeInTheDocument()
    expect(screen.getByTestId('first-name-input')).toBeInTheDocument()
    expect(screen.getByTestId('last-name-input')).toBeInTheDocument()
    expect(screen.getByTestId('birthday-input')).toBeInTheDocument()

    // Still no wheel: unknown is not identified (F08 R1).
    expect(screen.queryByTestId('spin-button')).not.toBeInTheDocument()
  })

  /**
   * A mistyped digit is far cheaper to notice before a name is attached to it
   * than after it has become a player nobody can find again.
   */
  it('shows the number being registered on the details step', async () => {
    fetchIdentityMock.mockResolvedValue(null)
    identifyPhoneMock.mockResolvedValue({ known: false, phone: '0912345678', player: null })

    const user = userEvent.setup()
    render(<PlayerPage />)
    await screen.findByTestId('identity-phone')

    await user.type(screen.getByTestId('phone-input'), '0912345678')
    await user.click(screen.getByTestId('phone-submit'))

    expect(await screen.findByTestId('identity-details')).toHaveTextContent('0912345678')
  })

  /** F08 R6 — and then the wheel */
  it('registers the details and shows the wheel', async () => {
    fetchIdentityMock.mockResolvedValue(null)
    identifyPhoneMock.mockResolvedValue({ known: false, phone: '0912345678', player: null })
    registerPlayerMock.mockResolvedValue(PLAYER)

    const user = userEvent.setup()
    render(<PlayerPage />)
    await screen.findByTestId('identity-phone')

    await user.type(screen.getByTestId('phone-input'), '0912345678')
    await user.click(screen.getByTestId('phone-submit'))
    await screen.findByTestId('identity-details')

    await user.type(screen.getByTestId('first-name-input'), 'Anh')
    await user.type(screen.getByTestId('last-name-input'), 'Le')
    await user.type(screen.getByTestId('birthday-input'), '1994-03-12')
    await user.click(screen.getByTestId('details-submit'))

    expect(await screen.findByTestId('wheel-preview')).toBeInTheDocument()

    // F08 R3: the server's canonical number is what gets registered, not the
    // string the player typed.
    expect(registerPlayerMock).toHaveBeenCalledWith({
      phone: '0912345678',
      firstName: 'Anh',
      lastName: 'Le',
      birthday: '1994-03-12',
    })
  })

  it('lets the player go back and change the number', async () => {
    fetchIdentityMock.mockResolvedValue(null)
    identifyPhoneMock.mockResolvedValue({ known: false, phone: '0912345678', player: null })

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
    fetchIdentityMock.mockResolvedValue(null)

    const user = userEvent.setup()
    render(<PlayerPage />)
    await screen.findByTestId('identity-phone')

    await user.type(screen.getByTestId('phone-input'), '123')
    await user.click(screen.getByTestId('phone-submit'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/does not look like a phone number/i)
    expect(identifyPhoneMock).not.toHaveBeenCalled()
  })

  it('asks for a number when the field is empty', async () => {
    fetchIdentityMock.mockResolvedValue(null)

    const user = userEvent.setup()
    render(<PlayerPage />)
    await screen.findByTestId('identity-phone')

    await user.click(screen.getByTestId('phone-submit'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter your phone number/i)
    expect(identifyPhoneMock).not.toHaveBeenCalled()
  })

  /** F08 R10 — every problem at once, not one per submission */
  it('reports all three missing details together', async () => {
    fetchIdentityMock.mockResolvedValue(null)
    identifyPhoneMock.mockResolvedValue({ known: false, phone: '0912345678', player: null })

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
    fetchIdentityMock.mockResolvedValue(null)
    identifyPhoneMock.mockResolvedValue({ known: false, phone: '0912345678', player: null })
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
    await user.type(screen.getByTestId('birthday-input'), '1994-03-12')
    await user.click(screen.getByTestId('details-submit'))

    expect(await screen.findByText('Server says no.')).toBeInTheDocument()
    expect(screen.getByTestId('first-name-input')).toHaveValue('Anh')
    expect(screen.getByTestId('last-name-input')).toHaveValue('Le')
  })

  it('reports a failed lookup and lets the player try again', async () => {
    fetchIdentityMock.mockResolvedValue(null)
    identifyPhoneMock.mockRejectedValueOnce(new ApiError('offline', 500))

    const user = userEvent.setup()
    render(<PlayerPage />)
    await screen.findByTestId('identity-phone')

    await user.type(screen.getByTestId('phone-input'), '0912345678')
    await user.click(screen.getByTestId('phone-submit'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not check that number/i)

    identifyPhoneMock.mockResolvedValue({ known: true, phone: '0912345678', player: PLAYER })
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
    fetchIdentityMock.mockResolvedValue(PLAYER)
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

    identifyPhoneMock.mockResolvedValue({ known: true, phone: '0987654321', player: PLAYER })
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

    identifyPhoneMock.mockResolvedValue({ known: true, phone: '0912345678', player: PLAYER })
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
    identifyPhoneMock.mockResolvedValue({ known: true, phone: '0912345678', player: PLAYER })

    const user = await renderPlayer()
    await user.click(screen.getByTestId('spin-button'))
    await screen.findByTestId('identity-phone')

    await user.type(screen.getByTestId('phone-input'), '0912345678')
    await user.click(screen.getByTestId('phone-submit'))

    expect(await screen.findByTestId('wheel-preview')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
