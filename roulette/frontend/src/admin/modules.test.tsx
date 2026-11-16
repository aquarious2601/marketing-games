import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { fetchSession } from '../api/auth'
import { fetchBranding } from '../api/branding'
import { fetchPlayers, fetchSpinLog } from '../api/players'
import { fetchRewards } from '../api/rewards'
import { fetchWheel } from '../api/wheel'
import { SessionProvider } from '../auth/SessionContext'

/**
 * F09: the three modules, through the real route tree.
 *
 * This renders `App` inside the same providers `main.tsx` uses rather than a
 * copy of the routing, because the behaviour under test — which URL opens
 * which module, and what `/admin` and `/admin/nonsense` do — lives in the
 * route configuration itself. A test that rebuilt those routes would pass
 * while the application's own were wrong.
 */

vi.mock('../api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/auth')>()),
  fetchSession: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('../api/wheel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/wheel')>()),
  fetchWheel: vi.fn(),
  saveWheel: vi.fn(),
}))

vi.mock('../api/branding', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/branding')>()),
  fetchBranding: vi.fn(),
  saveBranding: vi.fn(),
}))

vi.mock('../api/rewards', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/rewards')>()),
  fetchRewards: vi.fn(),
}))

vi.mock('../api/players', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/players')>()),
  fetchPlayers: vi.fn(),
  fetchPlayerHistory: vi.fn(),
  fetchSpinLog: vi.fn(),
}))

const fetchRewardsMock = vi.mocked(fetchRewards)
const fetchSessionMock = vi.mocked(fetchSession)
const fetchWheelMock = vi.mocked(fetchWheel)
const fetchBrandingMock = vi.mocked(fetchBranding)
const fetchPlayersMock = vi.mocked(fetchPlayers)
const fetchSpinLogMock = vi.mocked(fetchSpinLog)

const WHEEL = {
  id: 1,
  updatedAt: '2026-11-15T09:00:00+00:00',
  totalProbability: 100,
  includesLosingSlice: false,
  prizes: [
    { id: 1, name: 'Try again', probability: 60, position: 0, colour: '#475569', rewardId: 1 },
    { id: 2, name: 'Free gift', probability: 40, position: 1, colour: '#E11D48', rewardId: 2 },
  ],
}

const BRANDING = {
  companyName: null,
  campaignName: null,
  tagline: 'One spin, one prize. Good luck.',
  theme: 'plain',
  logoUrl: null,
  themes: [{ value: 'plain', label: 'Plain' }],
  currency: 'VND',
  currencySymbol: '₫',
  currencies: [{ value: 'VND', label: 'VND', symbol: '₫' }],
  ownTagline: null,
  ownCurrency: null,
  defaultCurrency: 'VND',
  defaultTagline: 'One spin, one prize. Good luck.',
}

const PLAYER = {
  id: 1,
  phone: '0912345678',
  firstName: 'Anh',
  lastName: 'Le',
  birthday: '1994-03-12',
  createdAt: '2026-11-15T09:30:00+00:00',
  spinCount: 2,
}

const SPIN = {
  id: 9,
  prizeName: 'Free sample',
  spunAt: '2026-11-15T10:02:11+00:00',
  player: { id: 1, phone: '0912345678', firstName: 'Anh', lastName: 'Le' },
  rewardType: 'percent_off' as const,
  rewardValue: 10,
  code: 'A7K3-M9PX',
  claimable: true,
  claimedAt: null,
}

beforeEach(() => {
  fetchRewardsMock.mockReset()
  fetchRewardsMock.mockResolvedValue({
    rewards: [
      { id: 1, name: 'Free sample', type: 'free_product', value: null, createdAt: '2026-11-15T09:00:00+00:00', usedBy: [] },
    ],
    types: [{ value: 'free_product', label: 'Free product' }],
  })
  fetchSessionMock.mockReset()
  fetchWheelMock.mockReset()
  fetchBrandingMock.mockReset()
  fetchPlayersMock.mockReset()
  fetchSpinLogMock.mockReset()

  fetchSessionMock.mockResolvedValue({ id: 1, username: 'tester' })
  fetchWheelMock.mockResolvedValue(WHEEL)
  fetchBrandingMock.mockResolvedValue(BRANDING)
  fetchPlayersMock.mockResolvedValue({ players: [PLAYER], total: 1 })
  fetchSpinLogMock.mockResolvedValue({ spins: [SPIN], total: 1 })
})

function renderAdmin(path = '/admin') {
  const user = userEvent.setup()

  render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <App />
      </SessionProvider>
    </MemoryRouter>,
  )

  return user
}

function heading(): Promise<HTMLElement> {
  return screen.findByRole('heading', { level: 1 })
}

describe('which URL opens which module', () => {
  /** F09 R3 — every link and bookmark that predates F09 still works */
  it('opens the Game module at /admin', async () => {
    renderAdmin('/admin')

    expect(await heading()).toHaveTextContent('Game')
    expect(await screen.findByTestId('branding-section')).toBeInTheDocument()
  })

  /** F09 R2 */
  it('opens the Game module at /admin/game', async () => {
    renderAdmin('/admin/game')

    expect(await heading()).toHaveTextContent('Game')
  })

  it('opens the Players module at /admin/players', async () => {
    renderAdmin('/admin/players')

    expect(await heading()).toHaveTextContent('Players')
    expect(await screen.findByTestId('players-section')).toBeInTheDocument()

    // The point of splitting the page: the other module is not merely
    // scrolled off, it is not there.
    expect(screen.queryByTestId('prize-row')).not.toBeInTheDocument()
    expect(screen.queryByTestId('branding-section')).not.toBeInTheDocument()
  })

  /** F13 R5: the catalogue has its own URL like every other module. */
  it('opens the Rewards module at /admin/rewards', async () => {
    renderAdmin('/admin/rewards')

    expect(await heading()).toHaveTextContent('Rewards')
    expect(await screen.findByTestId('rewards-section')).toBeInTheDocument()
    expect(screen.queryByTestId('players-section')).not.toBeInTheDocument()
  })

  it('opens the Spins module at /admin/spins', async () => {
    renderAdmin('/admin/spins')

    expect(await heading()).toHaveTextContent('Spins')
    expect(await screen.findByTestId('spin-log')).toBeInTheDocument()
    expect(screen.queryByTestId('players-section')).not.toBeInTheDocument()
  })

  /** F09 R4 — a dead end inside a working admin is worse than a redirect */
  it('opens the Game module for a URL it does not recognise', async () => {
    renderAdmin('/admin/nonsense')

    expect(await heading()).toHaveTextContent('Game')
  })
})

/** F09 R5 */
describe('the tab strip', () => {
  it('names every module', async () => {
    renderAdmin('/admin')
    await heading()

    const tabs = screen.getByTestId('admin-tabs')

    expect(tabs).toHaveAccessibleName('Admin modules')
    expect(screen.getByTestId('admin-tab-game')).toHaveTextContent('Game')
    // F13 added the fourth: the catalogue sits beside Game, because both
    // are things you set up.
    expect(screen.getByTestId('admin-tab-rewards')).toHaveTextContent('Rewards')
    expect(screen.getByTestId('admin-tab-players')).toHaveTextContent('Players')
    expect(screen.getByTestId('admin-tab-spins')).toHaveTextContent('Spins')
  })

  /**
   * Asserted rather than trusted: `aria-current` comes from NavLink, so it
   * is the router's behaviour and not this project's, and an underline alone
   * tells a screen reader nothing about which module is open.
   */
  it('marks the open module for assistive technology', async () => {
    renderAdmin('/admin/players')
    await heading()

    expect(screen.getByTestId('admin-tab-players')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('admin-tab-game')).not.toHaveAttribute('aria-current')
    expect(screen.getByTestId('admin-tab-spins')).not.toHaveAttribute('aria-current')
  })

  it('moves between modules when a tab is pressed', async () => {
    const user = renderAdmin('/admin')
    await heading()

    await user.click(screen.getByTestId('admin-tab-spins'))

    expect(await heading()).toHaveTextContent('Spins')
    expect(screen.getByTestId('admin-tab-spins')).toHaveAttribute('aria-current', 'page')

    await user.click(screen.getByTestId('admin-tab-game'))

    expect(await heading()).toHaveTextContent('Game')
  })

  it('stays available while a module is in an error state', async () => {
    fetchSpinLogMock.mockRejectedValue(new Error('offline'))

    const user = renderAdmin('/admin/spins')

    expect(await screen.findByRole('alert')).toHaveTextContent(/spins could not be loaded/i)

    // The admin can leave a broken module (F09 section 10).
    await user.click(screen.getByTestId('admin-tab-players'))
    expect(await heading()).toHaveTextContent('Players')
  })
})

/**
 * F09 R6, and the whole performance argument for splitting the page.
 *
 * Asserted by what is *not* called. This is the kind of claim that silently
 * stops being true the first time somebody lifts a fetch into a shared
 * parent, and nothing on screen would look different when it did.
 */
describe('a module loads only its own data', () => {
  it('does not fetch the spin log to show the Game module', async () => {
    renderAdmin('/admin')
    await heading()

    await waitFor(() => expect(fetchWheelMock).toHaveBeenCalled())

    expect(fetchSpinLogMock).not.toHaveBeenCalled()
    expect(fetchPlayersMock).not.toHaveBeenCalled()
  })

  it('does not fetch the wheel to show the Spins module', async () => {
    renderAdmin('/admin/spins')
    await heading()

    await waitFor(() => expect(fetchSpinLogMock).toHaveBeenCalled())

    expect(fetchWheelMock).not.toHaveBeenCalled()
    expect(fetchBrandingMock).not.toHaveBeenCalled()
  })

  it('does not fetch the wheel to show the Players module', async () => {
    renderAdmin('/admin/players')
    await heading()

    await waitFor(() => expect(fetchPlayersMock).toHaveBeenCalled())

    expect(fetchWheelMock).not.toHaveBeenCalled()
    expect(fetchSpinLogMock).not.toHaveBeenCalled()
  })

  it('fetches the data for a module only once it is opened', async () => {
    const user = renderAdmin('/admin')
    await heading()

    expect(fetchSpinLogMock).not.toHaveBeenCalled()

    await user.click(screen.getByTestId('admin-tab-spins'))
    await heading()

    await waitFor(() => expect(fetchSpinLogMock).toHaveBeenCalled())
  })
})

/** F09 R7 — the frame is the same whichever module is open */
describe('the admin frame', () => {
  it.each(['/admin/game', '/admin/rewards', '/admin/players', '/admin/spins'])(
    'offers sign out and names the user on %s',
    async (path) => {
      renderAdmin(path)
      await heading()

      expect(screen.getByTestId('signed-in-as')).toHaveTextContent('tester')
      expect(screen.getByTestId('sign-out')).toBeInTheDocument()
    },
  )

  /** F07 R22 still holds for every module */
  it.each(['/admin/game', '/admin/rewards', '/admin/players', '/admin/spins'])(
    'sends a signed-out visitor at %s to the login page',
    async (path) => {
      fetchSessionMock.mockResolvedValue(null)

      renderAdmin(path)

      expect(await screen.findByTestId('login-form')).toBeInTheDocument()
      expect(screen.queryByTestId('admin-tabs')).not.toBeInTheDocument()
    },
  )
})
