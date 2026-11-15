import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchBranding,
  removeLogo,
  saveBranding,
  uploadLogo,
  type AdminBranding,
  type LogoUpload,
} from '../api/branding'
import { ApiError, ApiValidationError } from '../api/client'
import { BrandingSection } from './BrandingSection'

vi.mock('../api/branding', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/branding')>()),
  fetchBranding: vi.fn(),
  saveBranding: vi.fn(),
  uploadLogo: vi.fn(),
  removeLogo: vi.fn(),
}))

const fetchMock = vi.mocked(fetchBranding)
const saveMock = vi.mocked(saveBranding)
const uploadMock = vi.mocked(uploadLogo)
const removeMock = vi.mocked(removeLogo)

const DEFAULT_TAGLINE = 'One spin, one prize. Good luck.'

const THEMES = [
  { value: 'plain', label: 'Plain' },
  { value: 'black-friday', label: 'Black Friday' },
  { value: 'christmas', label: 'Christmas' },
  { value: 'new-year', label: 'New Year' },
  { value: 'halloween', label: 'Halloween' },
  { value: 'birthday', label: 'Happy Birthday' },
]

function upload(overrides: Partial<LogoUpload> = {}): LogoUpload {
  return { ...branding(), notice: null, ...overrides }
}

function branding(overrides: Partial<AdminBranding> = {}): AdminBranding {
  return {
    companyName: null,
    campaignName: null,
    tagline: DEFAULT_TAGLINE,
    ownTagline: null,
    defaultTagline: DEFAULT_TAGLINE,
    theme: 'plain',
    currency: 'VND',
    currencySymbol: '₫',
    logoUrl: null,
    themes: THEMES,
    currencies: [{ value: 'VND', label: 'VND', symbol: '₫' }],
    ...overrides,
  }
}

beforeEach(() => {
  fetchMock.mockReset()
  saveMock.mockReset()
  uploadMock.mockReset()
  removeMock.mockReset()
  fetchMock.mockResolvedValue(branding())
})

async function renderSection(initial?: Partial<AdminBranding>) {
  if (initial !== undefined) {
    fetchMock.mockResolvedValue(branding(initial))
  }

  const user = userEvent.setup()
  render(<BrandingSection />)
  await screen.findByTestId('branding-section')

  return user
}

const companyField = () => screen.getByLabelText(/company name/i)
const campaignField = () => screen.getByLabelText(/campaign name/i)
const taglineField = () => screen.getByLabelText(/^tagline$/i)
const themeField = () => screen.getByLabelText(/^theme$/i)
const saveButton = () => screen.getByTestId('save-branding')

describe('loading', () => {
  it('shows the stored values', async () => {
    await renderSection({ companyName: 'AA Store', campaignName: 'Noel', theme: 'christmas' })

    expect(companyField()).toHaveValue('AA Store')
    expect(campaignField()).toHaveValue('Noel')
    expect(themeField()).toHaveValue('christmas')
  })

  /** F04 R7 */
  it('offers every theme the server knows about', async () => {
    await renderSection()

    const options = Array.from(themeField().querySelectorAll('option')).map((o) => o.textContent)

    expect(options).toEqual([
      'Plain',
      'Black Friday',
      'Christmas',
      'New Year',
      'Halloween',
      'Happy Birthday',
    ])
  })

  it('offers a retry when the branding cannot be loaded', async () => {
    fetchMock.mockRejectedValue(new ApiError('nope', 500))
    const user = userEvent.setup()
    render(<BrandingSection />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i)

    fetchMock.mockResolvedValue(branding())
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(await screen.findByTestId('branding-section')).toBeInTheDocument()
  })

  it('caps the name fields at sixty characters', async () => {
    await renderSection()

    expect(companyField()).toHaveAttribute('maxlength', '60')
    expect(campaignField()).toHaveAttribute('maxlength', '60')
  })
})

describe('saving', () => {
  it('is disabled until something changes', async () => {
    const user = await renderSection()

    expect(saveButton()).toBeDisabled()

    await user.type(companyField(), 'A')

    expect(saveButton()).toBeEnabled()
  })

  it('sends the names, the tagline and the theme', async () => {
    saveMock.mockResolvedValue(branding({ companyName: 'AA Store', theme: 'halloween' }))
    const user = await renderSection()

    await user.type(companyField(), 'AA Store')
    await user.selectOptions(themeField(), 'halloween')
    await user.click(saveButton())

    await waitFor(() =>
      expect(saveMock).toHaveBeenCalledWith({
        companyName: 'AA Store',
        campaignName: '',
        tagline: '',
        theme: 'halloween',
      }),
    )
  })

  it('sends a tagline the admin typed', async () => {
    saveMock.mockResolvedValue(branding())
    const user = await renderSection()

    await user.type(taglineField(), 'Spin for a treat!')
    await user.click(saveButton())

    await waitFor(() =>
      expect(saveMock).toHaveBeenCalledWith(
        expect.objectContaining({ tagline: 'Spin for a treat!' }),
      ),
    )
  })

  it('shows the admin their own tagline, not the default', async () => {
    await renderSection({ ownTagline: 'Spin for a treat!', tagline: 'Spin for a treat!' })

    expect(taglineField()).toHaveValue('Spin for a treat!')
  })

  it('leaves the field empty when the default is in use, and offers it', async () => {
    await renderSection()

    expect(taglineField()).toHaveValue('')
    expect(taglineField()).toHaveAttribute('placeholder', DEFAULT_TAGLINE)
    expect(screen.getByText(new RegExp(DEFAULT_TAGLINE.replace(/[.!]/g, '\$&')))).toBeInTheDocument()
  })

  it('caps the tagline at 120 characters', async () => {
    await renderSection()

    expect(taglineField()).toHaveAttribute('maxlength', '120')
  })

  it('confirms a save and returns to clean', async () => {
    saveMock.mockResolvedValue(branding({ companyName: 'AA Store' }))
    const user = await renderSection()

    await user.type(companyField(), 'AA Store')
    await user.click(saveButton())

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('keeps the edits and shows the reason when the server rejects them', async () => {
    saveMock.mockRejectedValue(
      new ApiValidationError('invalid', [
        { field: 'companyName', message: 'This can be at most 60 characters.' },
      ]),
    )
    const user = await renderSection()

    await user.type(companyField(), 'AA Store')
    await user.click(saveButton())

    expect(await screen.findByText(/at most 60 characters/i)).toBeInTheDocument()
    expect(companyField()).toHaveValue('AA Store')
    expect(companyField()).toHaveAttribute('aria-invalid', 'true')
  })

  it('keeps the edits when the server is unreachable', async () => {
    saveMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const user = await renderSection()

    await user.type(campaignField(), 'Noel')
    await user.click(saveButton())

    expect(await screen.findByText(/could not be saved/i)).toBeInTheDocument()
    expect(campaignField()).toHaveValue('Noel')
  })
})

describe('the logo', () => {
  const file = (name = 'logo.png', type = 'image/png') =>
    new File(['fake-bytes'], name, { type })

  it('uploads a chosen file', async () => {
    uploadMock.mockResolvedValue(upload({ logoUrl: '/api/branding/logo?v=2' }))
    const user = await renderSection()

    await user.upload(screen.getByLabelText(/^logo$/i), file())

    await waitFor(() => expect(uploadMock).toHaveBeenCalledOnce())
    expect(await screen.findByTestId('current-logo')).toHaveAttribute(
      'src',
      '/api/branding/logo?v=2',
    )
  })

  /** F05 R16 — SVG joined the list */
  it('only accepts the formats the server will take', async () => {
    await renderSection()

    expect(screen.getByLabelText(/^logo$/i)).toHaveAttribute(
      'accept',
      'image/png,image/jpeg,image/webp,image/svg+xml',
    )
  })

  it('tells the admin exactly why the server refused a file', async () => {
    uploadMock.mockRejectedValue(
      new ApiValidationError('invalid', [
        { field: 'logo', message: 'That SVG declares XML entities, which are not allowed.' },
      ]),
    )
    const user = await renderSection()

    await user.upload(screen.getByLabelText(/^logo$/i), file('logo.svg', 'image/svg+xml'))

    expect(await screen.findByText(/declares XML entities/i)).toBeInTheDocument()
  })

  it('reports an upload that fails for other reasons', async () => {
    uploadMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const user = await renderSection()

    await user.upload(screen.getByLabelText(/^logo$/i), file())

    expect(await screen.findByText(/could not be uploaded/i)).toBeInTheDocument()
  })

  it('offers no Remove button when there is no logo', async () => {
    await renderSection()

    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('current-logo')).not.toBeInTheDocument()
  })

  it('removes the logo', async () => {
    removeMock.mockResolvedValue(branding({ logoUrl: null }))
    const user = await renderSection({ logoUrl: '/api/branding/logo?v=1' })

    expect(screen.getByTestId('current-logo')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /remove/i }))

    await waitFor(() => expect(removeMock).toHaveBeenCalledOnce())
    expect(screen.queryByTestId('current-logo')).not.toBeInTheDocument()
  })

  /** F05 R17 */
  /** F05 R10 */
  it('reports what sanitising removed from an SVG', async () => {
    uploadMock.mockResolvedValue(
      upload({
        logoUrl: '/api/branding/logo?v=3',
        notice: 'Some content was removed from the SVG for safety: scripts.',
      }),
    )
    const user = await renderSection()

    await user.upload(screen.getByLabelText(/^logo$/i), file('logo.svg', 'image/svg+xml'))

    const notice = await screen.findByTestId('logo-notice')
    expect(notice).toHaveTextContent(/scripts/)
    // The upload worked, so this is information rather than a failure.
    expect(notice).not.toHaveAttribute('role', 'alert')
    expect(screen.getByTestId('current-logo')).toBeInTheDocument()
  })

  /** F05 R11 */
  it('shows no notice when the file came through untouched', async () => {
    uploadMock.mockResolvedValue(upload({ logoUrl: '/api/branding/logo?v=4', notice: null }))
    const user = await renderSection()

    await user.upload(screen.getByLabelText(/^logo$/i), file('logo.svg', 'image/svg+xml'))

    await screen.findByTestId('current-logo')
    expect(screen.queryByTestId('logo-notice')).not.toBeInTheDocument()
  })

  it('says what is allowed, and that SVGs are cleaned', async () => {
    await renderSection()

    expect(screen.getByText(/PNG, JPEG, WebP or SVG, up to 2MB/i)).toBeInTheDocument()
    expect(screen.getByText(/cleaned before use/i)).toBeInTheDocument()
  })
})
