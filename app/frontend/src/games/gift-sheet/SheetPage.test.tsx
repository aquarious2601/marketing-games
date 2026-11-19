import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import { fetchIdentity, forgetPlayer } from '../../api/player'
import { I18nProvider } from '../../i18n/I18nContext'
import { fetchSheet, issueSheet, type IssuedSheet, type Sheet } from './api'
import { SheetPage } from './SheetPage'

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  fetchSheet: vi.fn(),
  issueSheet: vi.fn(),
}))

vi.mock('../../api/player', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/player')>()),
  fetchIdentity: vi.fn(),
  forgetPlayer: vi.fn(),
  identifyPhone: vi.fn(),
  registerPlayer: vi.fn(),
}))

const fetchSheetMock = vi.mocked(fetchSheet)
const issueSheetMock = vi.mocked(issueSheet)
const fetchIdentityMock = vi.mocked(fetchIdentity)
const forgetPlayerMock = vi.mocked(forgetPlayer)

const BRANDING = {
  companyName: 'AA Store',
  theme: 'plain',
  currency: 'VND',
  currencySymbol: '₫',
  logoUrl: null,
  campaignName: 'Welcome pack',
  tagline: 'Fill this in and the gifts are yours.',
}

const PLAYER = { id: 1, phone: '0912345678', firstName: 'Anh', lastName: 'Le' }

function sheet(overrides: Partial<Sheet> = {}): Sheet {
  return {
    gifts: [
      { name: 'Free coffee', type: 'free_product', value: null },
      { name: 'Ten off', type: 'percent_off', value: 10 },
    ],
    branding: BRANDING,
    issued: null,
    ...overrides,
  }
}

function issued(): IssuedSheet {
  return {
    sheetId: 'AE6QKVNH1234',
    gifts: [
      { name: 'Free coffee', type: 'free_product', value: null, code: 'BC5W1234' },
      { name: 'Ten off', type: 'percent_off', value: 10, code: 'C6HE5678' },
    ],
  }
}

beforeEach(() => {
  fetchSheetMock.mockReset()
  issueSheetMock.mockReset()
  fetchIdentityMock.mockReset()
  forgetPlayerMock.mockReset()

  fetchSheetMock.mockResolvedValue(sheet())
  fetchIdentityMock.mockResolvedValue({ player: PLAYER, spin: null, spinsLeft: null })
  issueSheetMock.mockResolvedValue(issued())
  forgetPlayerMock.mockResolvedValue()
})

async function renderSheet() {
  const user = userEvent.setup()

  render(
    <I18nProvider>
      <SheetPage />
    </I18nProvider>,
  )

  await screen.findByRole('heading', { level: 2 })

  return user
}

describe('before the gifts are given', () => {
  /** F28 §9: a sheet has nothing to hide — they are getting all of it. */
  it('lists what is on the sheet, with no codes', async () => {
    await renderSheet()

    const list = screen.getByTestId('sheet-gifts')

    expect(within(list).getByText('Free coffee')).toBeInTheDocument()
    expect(within(list).getByText('Ten off')).toBeInTheDocument()
    expect(screen.queryByTestId('issued-code')).not.toBeInTheDocument()
  })

  /** F28 R9: one control, and the codes are minted by pressing it. */
  it('gives the whole sheet when the control is pressed', async () => {
    const user = await renderSheet()

    await user.click(screen.getByTestId('get-gifts'))

    await waitFor(() => expect(issueSheetMock).toHaveBeenCalledTimes(1))
    expect(await screen.findByTestId('issued-sheet')).toBeInTheDocument()
  })

  /** F28 R8: no gifts for a visitor who has not said who they are. */
  it('asks who they are first', async () => {
    fetchIdentityMock.mockResolvedValue({ player: null, spin: null, spinsLeft: null })

    render(
      <I18nProvider>
        <SheetPage />
      </I18nProvider>,
    )

    expect(await screen.findByLabelText(/phone number/i)).toBeInTheDocument()
    expect(screen.queryByTestId('get-gifts')).not.toBeInTheDocument()
  })
})

describe('once they are given', () => {
  /** F28 R10, R13: every gift, each with its own code. */
  it('shows every gift with its code', async () => {
    const user = await renderSheet()

    await user.click(screen.getByTestId('get-gifts'))

    const rows = await screen.findAllByTestId('issued-gift')

    expect(rows).toHaveLength(2)
    expect(screen.getAllByTestId('issued-code').map((code) => code.textContent)).toEqual([
      'BC5W1234',
      'C6HE5678',
    ])
  })

  /** F28 R13: and says what to do with them. */
  it('tells them to show it at the counter', async () => {
    const user = await renderSheet()

    await user.click(screen.getByTestId('get-gifts'))

    expect(await screen.findByText(/at the counter/i)).toBeInTheDocument()
  })

  /** F28 R18: a reload keeps the codes this session was given. */
  it('shows a sheet the server already issued to this session', async () => {
    fetchSheetMock.mockResolvedValue(sheet({ issued: issued() }))
    await renderSheet()

    expect(screen.getByTestId('issued-sheet')).toBeInTheDocument()
    expect(issueSheetMock).not.toHaveBeenCalled()
  })

  /** F28 R14, F10 R3: the stall phone moves on, inheriting nothing. */
  it('hands over to the next player', async () => {
    const user = await renderSheet()
    await user.click(screen.getByTestId('get-gifts'))
    await screen.findByTestId('issued-sheet')

    await user.click(screen.getByTestId('next-player'))

    await waitFor(() => expect(forgetPlayerMock).toHaveBeenCalled())
    expect(screen.queryByTestId('issued-sheet')).not.toBeInTheDocument()
  })
})

describe('when the day is used up', () => {
  /**
   * F28 R18, which is F23 R14–R17 unchanged: they have played today, and
   * the screen says so and nothing else. No codes — anybody may type
   * anybody's number into a stall phone.
   */
  it('says come back tomorrow, with no codes on it', async () => {
    issueSheetMock.mockRejectedValue(new ApiError('too many', 429))
    const user = await renderSheet()

    await user.click(screen.getByTestId('get-gifts'))

    expect(await screen.findByTestId('sheet-spent')).toHaveTextContent(/come back tomorrow/i)
    expect(screen.queryByTestId('issued-code')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sheet-gifts')).not.toBeInTheDocument()
  })

  /** F23 R16: and the stall can still move on. */
  it('still offers the next player', async () => {
    issueSheetMock.mockRejectedValue(new ApiError('too many', 429))
    const user = await renderSheet()

    await user.click(screen.getByTestId('get-gifts'))
    await screen.findByTestId('sheet-spent')

    expect(screen.getByTestId('next-player')).toBeInTheDocument()
  })

  /** Any other failure is a failure, and nothing was used up. */
  it('reports a failure that is not a refusal', async () => {
    issueSheetMock.mockRejectedValue(new ApiError('boom', 500))
    const user = await renderSheet()

    await user.click(screen.getByTestId('get-gifts'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be given out/i)
  })
})

describe('what it never shows', () => {
  /** F28 R10, and the repository's rule: the player is never shown odds. */
  it('states no probability anywhere', async () => {
    const user = await renderSheet()
    await user.click(screen.getByTestId('get-gifts'))
    await screen.findByTestId('issued-sheet')

    expect(document.body.textContent).not.toMatch(/%/)
    expect(document.body.textContent).not.toMatch(/chance|odds/i)
  })
})

describe('the celebration', () => {
  /** F28 R15, F22 R1: once for the sheet, not once per gift. */
  it('fires once when the sheet is given', async () => {
    const user = await renderSheet()

    await user.click(screen.getByTestId('get-gifts'))
    await screen.findByTestId('issued-sheet')

    expect(screen.getAllByTestId('confetti')).toHaveLength(1)
  })

  /** F22 R5: the next person does not inherit the last one's confetti. */
  it('is gone once the phone is handed on', async () => {
    const user = await renderSheet()
    await user.click(screen.getByTestId('get-gifts'))
    await screen.findByTestId('issued-sheet')

    await user.click(screen.getByTestId('next-player'))

    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument()
  })

  /** F28 R18: a sheet read back on a reload is not a fresh celebration. */
  it('does not fire for a sheet that was already issued', async () => {
    fetchSheetMock.mockResolvedValue(sheet({ issued: issued() }))
    await renderSheet()

    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument()
  })
})
