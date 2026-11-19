import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiValidationError } from '../api/client'
import { saveGame, type GameSummary } from '../api/games'
import { I18nProvider } from '../i18n/I18nContext'
import { GameSettings } from './GameSettings'

vi.mock('../api/games', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/games')>()),
  saveGame: vi.fn(),
}))

const saveGameMock = vi.mocked(saveGame)

const DEFAULT_TAGLINE = 'One spin, one prize. Good luck.'

const THEMES = [
  { value: 'plain', label: 'Plain' },
  { value: 'christmas', label: 'Christmas' },
  { value: 'halloween', label: 'Halloween' },
]

function game(overrides: Partial<GameSummary> = {}): GameSummary {
  return {
    id: 1,
    name: 'Test campaign',
    type: 'wheel',
    ownTagline: null,
    defaultTagline: DEFAULT_TAGLINE,
    // F27 R29: no limit, which is every game until an admin sets one.
    dailyLimit: null,
    linkKey: 'q7mfd2xkbnrt',
    // F30 R1, R9: a game starts plain.
    theme: 'plain',
    playPath: '/play/q7mfd2xkbnrt',
    isLive: true,
    plays: 0,
    notReady: null,
    ...overrides,
  }
}

beforeEach(() => {
  saveGameMock.mockReset()
  saveGameMock.mockResolvedValue(game())
})

function renderSettings(overrides: Partial<GameSummary> = {}) {
  const user = userEvent.setup()

  render(
    <I18nProvider>
      <GameSettings
        game={game(overrides)}
        maxDailyLimit={99}
        themes={THEMES}
        onSaved={() => {}}
      />
    </I18nProvider>,
  )

  return user
}

const nameField = () => screen.getByLabelText(/^name$/i)
const taglineField = () => screen.getByLabelText(/^tagline$/i)
const limitField = () => screen.getByLabelText(/plays per person per day/i)
const themeField = () => screen.getByLabelText(/^theme$/i)
const saveButton = () => screen.getByTestId('save-game')

describe('the game itself', () => {
  /** F27 R40 */
  it('shows the stored values', () => {
    renderSettings({ name: 'Noel', ownTagline: 'Spin for a treat!', dailyLimit: 3 })

    expect(nameField()).toHaveValue('Noel')
    expect(taglineField()).toHaveValue('Spin for a treat!')
    expect(limitField()).toHaveValue(3)
  })

  it('is disabled until something changes', async () => {
    const user = renderSettings()

    expect(saveButton()).toBeDisabled()

    await user.type(nameField(), '!')

    expect(saveButton()).toBeEnabled()
  })

  it('sends the name, the tagline and the limit', async () => {
    const user = renderSettings()

    await user.clear(nameField())
    await user.type(nameField(), 'Noel')
    await user.type(taglineField(), 'Spin for a treat!')
    await user.type(limitField(), '2')
    await user.click(saveButton())

    await waitFor(() =>
      expect(saveGameMock).toHaveBeenCalledWith(1, {
        name: 'Noel',
        tagline: 'Spin for a treat!',
        dailyLimit: 2,
        theme: 'plain',
      }),
    )
  })
})

describe('the tagline', () => {
  /**
   * F27 R12, F04 R29. The admin edits their own value; the type's default is
   * offered as a placeholder, never pre-filled — a filled-in default is a
   * default they can never get back to.
   */
  it('leaves the field empty when the default is in use, and offers it', () => {
    renderSettings()

    expect(taglineField()).toHaveValue('')
    expect(taglineField()).toHaveAttribute('placeholder', DEFAULT_TAGLINE)
  })

  it('shows the admin their own tagline rather than the default', () => {
    renderSettings({ ownTagline: 'Spin for a treat!' })

    expect(taglineField()).toHaveValue('Spin for a treat!')
  })

  /** F27 R12: clearing it is how a game goes back to the default. */
  it('sends null when the field is cleared', async () => {
    const user = renderSettings({ ownTagline: 'Spin for a treat!' })

    await user.clear(taglineField())
    await user.click(saveButton())

    await waitFor(() =>
      expect(saveGameMock).toHaveBeenCalledWith(1, expect.objectContaining({ tagline: null })),
    )
  })
})

describe('the daily limit', () => {
  /** F27 R29: blank is no limit, and it is the common case. */
  it('shows an empty field when the game has no limit', () => {
    renderSettings({ dailyLimit: null })

    expect(limitField()).toHaveValue(null)
  })

  /** F27 R29: clearing the field is how a game goes back to no limit. */
  it('sends null when the field is cleared', async () => {
    const user = renderSettings({ dailyLimit: 5 })

    await user.clear(limitField())
    await user.click(saveButton())

    await waitFor(() =>
      expect(saveGameMock).toHaveBeenCalledWith(1, expect.objectContaining({ dailyLimit: null })),
    )
  })

  /**
   * F23 R21, F27 R29. The server decides what a valid limit is — one place,
   * because it is the one that also has to refuse the next client — and its
   * answer lands on the field that caused it (F01 R12).
   */
  it('shows the server violation under the field', async () => {
    saveGameMock.mockRejectedValue(
      new ApiValidationError('nope', [
        { field: 'dailyLimit', message: 'Plays per day must be a whole number from 1 to 99.' },
      ]),
    )
    const user = renderSettings()

    await user.type(limitField(), '0')
    await user.click(saveButton())

    expect(await screen.findByText(/whole number from 1 to 99/i)).toBeInTheDocument()
  })

  /** F23 R2, F27 R30: the parts an admin would not guess from the label. */
  it('says that it counts the person, and that each game counts its own', async () => {
    renderSettings()

    expect(screen.getByText(/counts the person, not the phone/i)).toBeInTheDocument()
    expect(screen.getByText(/each game counts its own/i)).toBeInTheDocument()
  })
})

/** F30 R14: the theme is edited here, with the promotion's other fields. */
describe('the theme', () => {
  it("opens on the game's own", async () => {
    renderSettings({ theme: 'christmas' })

    expect(themeField()).toHaveValue('christmas')
  })

  it('offers the themes the server sent', async () => {
    renderSettings()

    const options = Array.from(themeField().querySelectorAll('option')).map((o) => o.textContent)

    expect(options).toEqual(['Plain', 'Christmas', 'Halloween'])
  })

  it('is sent on save', async () => {
    const user = renderSettings()

    await user.selectOptions(themeField(), 'halloween')
    await user.click(saveButton())

    await waitFor(() =>
      expect(saveGameMock).toHaveBeenCalledWith(1, {
        name: 'Test campaign',
        tagline: null,
        dailyLimit: null,
        theme: 'halloween',
      }),
    )
  })

  /** Nothing else on this form has changed, so the Save must still wake up. */
  it('makes the form dirty on its own', async () => {
    const user = renderSettings()

    expect(saveButton()).toBeDisabled()

    await user.selectOptions(themeField(), 'christmas')

    expect(saveButton()).toBeEnabled()
  })

  /**
   * F30 R9. Plain is a theme somebody chose, not an absence: the editor
   * offers it like any other and the server stores it.
   */
  it('can be set back to plain', async () => {
    const user = renderSettings({ theme: 'christmas' })

    await user.selectOptions(themeField(), 'plain')
    await user.click(saveButton())

    await waitFor(() =>
      expect(saveGameMock).toHaveBeenCalledWith(1, expect.objectContaining({ theme: 'plain' })),
    )
  })
})
