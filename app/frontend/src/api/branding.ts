import { apiDelete, apiGet, apiPut, apiUpload, type RequestOptions } from './client'

/**
 * What every game shows (F27 R2, R10): the shop's own identity.
 *
 * This is the half that belongs to the store. What a promotion is called and
 * what its phrase is belongs to the game (R11) and arrives beside these on
 * the player's payload — see `Branding` below.
 */
export interface StoreBranding {
  companyName: string | null
  theme: string
  /**
   * F13 R27, R28. The code and its symbol travel together, so neither the
   * admin nor the player page needs its own table of symbols.
   *
   * F15 R5: the *effective* currency — what the admin chose, or what this
   * reader's language suggests while nothing has been chosen.
   */
  currency: string
  currencySymbol: string
  /** Null when no logo is set, or the file is missing (F04 R26). */
  logoUrl: string | null
}

/**
 * What the player page reads: the shop's branding with the game's own words
 * in it, which is the shape this payload has always had (F27 R11).
 */
export interface Branding extends StoreBranding {
  campaignName: string
  /** The effective phrase: the admin's, or the game type's default. */
  tagline: string
}

export interface ThemeOption {
  value: string
  label: string
}

export interface CurrencyOption {
  value: string
  label: string
  symbol: string
}

/** The Store module's payload (F27 R37). */
export interface AdminStore extends StoreBranding {
  themes: ThemeOption[]
  /** F13 R27: the currencies a shop may be counted in. */
  currencies: CurrencyOption[]
  /** F15 R4: the chosen currency, or null while nobody has chosen. */
  ownCurrency: string | null
  /** F15 R2: what this admin's language suggests, used only while unchosen. */
  defaultCurrency: string
  /** F27 R17. Null means no choice, and the browser decides as it always has. */
  language: string | null
  /** F27 R15. Never null: the upgrade seeded it and the form requires one. */
  timezone: string
}

/**
 * The upload response. `notice` is set when sanitising removed something
 * from an SVG (F05 R10) and null when the file came through untouched.
 */
export interface LogoUpload extends StoreBranding {
  notice: string | null
}

export interface StoreSubmission {
  companyName: string
  theme: string
  /** F15 R10. Omitted leaves the shop's currency alone (F13 R27). */
  currency?: string
  /** F27 R17. Null means "let the browser decide". */
  language: string | null
  /** F27 R15. Omitted leaves the shop's clock alone. */
  timezone?: string
}

export async function fetchStore(options?: RequestOptions): Promise<AdminStore> {
  return apiGet<AdminStore>('/admin/store', options)
}

export async function saveStore(
  submission: StoreSubmission,
  options?: RequestOptions,
): Promise<StoreBranding> {
  return apiPut<StoreBranding>('/admin/store', submission, options)
}

export async function uploadLogo(file: File, options?: RequestOptions): Promise<LogoUpload> {
  const form = new FormData()
  form.append('logo', file)

  return apiUpload<LogoUpload>('/admin/store/logo', form, options)
}

export async function removeLogo(options?: RequestOptions): Promise<StoreBranding> {
  return apiDelete<StoreBranding>('/admin/store/logo', options)
}
