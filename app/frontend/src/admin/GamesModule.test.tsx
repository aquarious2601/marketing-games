import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, ApiValidationError } from '../api/client'
import { createGame, fetchGames, setGameLive, type GameSummary } from '../api/games'
import { I18nProvider } from '../i18n/I18nContext'
import { GamesModule } from './GamesModule'

vi.mock('../api/games', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/games')>()),
  fetchGames: vi.fn(),
  createGame: vi.fn(),
  setGameLive: vi.fn(),
}))

const fetchGamesMock = vi.mocked(fetchGames)
const createGameMock = vi.mocked(createGame)
const setGameLiveMock = vi.mocked(setGameLive)

function game(overrides: Partial<GameSummary> = {}): GameSummary {
  return {
    id: 1,
    name: 'Test campaign',
    type: 'wheel',
    ownTagline: null,
    defaultTagline: 'One spin, one prize. Good luck.',
    dailyLimit: null,
    linkKey: 'q7mfd2xkbnrt',
    // F30 R1, R9: a game starts plain.
    theme: 'plain',
    playPath: '/play/q7mfd2xkbnrt',
    isLive: true,
    plays: 4,
    notReady: null,
    ...overrides,
  }
}

const TYPES = [{ value: 'wheel', label: 'Prize wheel' }]
const THEMES = [
  { value: 'plain', label: 'Plain' },
  { value: 'christmas', label: 'Christmas' },
  { value: 'halloween', label: 'Halloween' },
]

beforeEach(() => {
  fetchGamesMock.mockReset()
  createGameMock.mockReset()
  setGameLiveMock.mockReset()

  fetchGamesMock.mockResolvedValue({ games: [game()], types: TYPES, themes: THEMES, maxDailyLimit: 99 })
})

async function renderModule() {
  const user = userEvent.setup()

  render(
    <I18nProvider>
      <MemoryRouter>
        <GamesModule />
      </MemoryRouter>
    </I18nProvider>,
  )

  await screen.findByTestId('games-list')

  return user
}

describe('the list', () => {
  /** F27 R38 */
  it('shows each game with its kind, its state and how often it was played', async () => {
    await renderModule()

    const row = screen.getByTestId('game-1')

    expect(within(row).getByText('Test campaign')).toBeInTheDocument()
    // Scoped to the row: the New game form's selector names the kinds too.
    expect(within(row).getByText('Prize wheel')).toBeInTheDocument()
    expect(screen.getByTestId('game-1-state')).toHaveTextContent('Live')
    expect(screen.getByTestId('game-1-plays')).toHaveTextContent('4')
  })

  /** F27 R41: the whole URL, because the whole URL is what gets printed. */
  // F27 R41. Built from the page's own origin, which is the only thing that
  // knows it: the server answers from a different host in development.
  it('shows the whole link', async () => {
    await renderModule()

    expect(screen.getByTestId('game-1-link')).toHaveTextContent(
      `${window.location.origin}/play/q7mfd2xkbnrt`,
    )
  })

  it('offers an empty list rather than nothing at all', async () => {
    fetchGamesMock.mockResolvedValue({ games: [], types: TYPES, themes: THEMES, maxDailyLimit: 99 })
    await renderModule()

    expect(screen.getByText(/no games yet/i)).toBeInTheDocument()
  })

  it('offers a retry when the list cannot be loaded', async () => {
    fetchGamesMock.mockRejectedValueOnce(new ApiError('nope', 500))
    const user = userEvent.setup()

    render(
      <I18nProvider>
        <MemoryRouter>
          <GamesModule />
        </MemoryRouter>
      </I18nProvider>,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i)

    fetchGamesMock.mockResolvedValue({ games: [game()], types: TYPES, themes: THEMES, maxDailyLimit: 99 })
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(await screen.findByTestId('games-list')).toBeInTheDocument()
  })
})

describe('creating one', () => {
  /** F27 R39: a name and a kind, and nothing else. */
  it('creates a game and reloads the list', async () => {
    createGameMock.mockResolvedValue(game({ id: 2, name: 'Black Friday', isLive: false }))
    const user = await renderModule()

    await user.type(screen.getByLabelText(/^name$/i), 'Black Friday')
    await user.click(screen.getByTestId('create-game'))

    await waitFor(() =>
      expect(createGameMock).toHaveBeenCalledWith({ name: 'Black Friday', type: 'wheel' }),
    )
    expect(fetchGamesMock).toHaveBeenCalledTimes(2)
  })

  /** F27 R5, said before the choice is made rather than after. */
  it('warns that the kind cannot be changed later', async () => {
    await renderModule()

    expect(screen.getByText(/cannot be changed afterwards/i)).toBeInTheDocument()
  })

  it('puts a server violation against the field that caused it', async () => {
    createGameMock.mockRejectedValue(
      new ApiValidationError('nope', [{ field: 'name', message: 'Give this game a name.' }]),
    )
    const user = await renderModule()

    await user.click(screen.getByTestId('create-game'))

    expect(await screen.findByText('Give this game a name.')).toBeInTheDocument()
  })
})

describe('turning one live', () => {
  /** F27 R42: reversible, with one control and no confirmation step. */
  it('turns a live game off', async () => {
    setGameLiveMock.mockResolvedValue(game({ isLive: false }))
    const user = await renderModule()

    await user.click(screen.getByTestId('game-1-toggle'))

    await waitFor(() => expect(setGameLiveMock).toHaveBeenCalledWith(1, false))
  })

  it('turns an off game live', async () => {
    fetchGamesMock.mockResolvedValue({
      games: [game({ isLive: false })],
      types: TYPES,
      themes: THEMES,
      maxDailyLimit: 99,
    })
    setGameLiveMock.mockResolvedValue(game({ isLive: true }))
    const user = await renderModule()

    await user.click(screen.getByTestId('game-1-toggle'))

    await waitFor(() => expect(setGameLiveMock).toHaveBeenCalledWith(1, true))
  })

  /**
   * F27 R43. The server's sentence, shown as it came: it names the thing
   * that is missing, which is the whole reason it answers with a message
   * rather than a flag.
   */
  it('shows why a refused game could not go live', async () => {
    fetchGamesMock.mockResolvedValue({
      games: [game({ isLive: false, notReady: 'This game has no wheel yet.' })],
      types: TYPES,
      themes: THEMES,
      maxDailyLimit: 99,
    })
    setGameLiveMock.mockRejectedValue(new ApiError('The probabilities total 97.', 409))
    const user = await renderModule()

    await user.click(screen.getByTestId('game-1-toggle'))

    expect(await screen.findByRole('alert')).toHaveTextContent('The probabilities total 97.')
  })

  /** F27 R43: said in the list, before anybody presses the control. */
  it('says in the row why a game is not ready', async () => {
    fetchGamesMock.mockResolvedValue({
      games: [game({ isLive: false, notReady: 'This game has no wheel yet.' })],
      types: TYPES,
      themes: THEMES,
      maxDailyLimit: 99,
    })
    await renderModule()

    expect(screen.getByTestId('game-1-not-ready')).toHaveTextContent('no wheel yet')
  })

  /** A live game has nothing to warn about, whatever the server reports. */
  it('says nothing about readiness on a live game', async () => {
    await renderModule()

    expect(screen.queryByTestId('game-1-not-ready')).not.toBeInTheDocument()
  })
})
