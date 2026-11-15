import { apiDelete, apiGet, apiPut, apiUpload, type RequestOptions } from './client'

export interface Branding {
  companyName: string | null
  campaignName: string | null
  /** The effective phrase: the admin's, or the default. Never null. */
  tagline: string
  theme: string
  /**
   * F13 R27, R28. The code and its symbol travel together, so neither the
   * admin nor the player page needs its own table of symbols.
   */
  currency: string
  currencySymbol: string
  /** Null when no logo is set, or the file is missing (F04 R26). */
  logoUrl: string | null
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

export interface AdminBranding extends Branding {
  themes: ThemeOption[]
  /** F13 R27: the currencies a campaign may be counted in. */
  currencies: CurrencyOption[]
  /** What the admin actually set; null means the default is in use. */
  ownTagline: string | null
  defaultTagline: string
}

/**
 * The upload response. `notice` is set when sanitising removed something
 * from an SVG (F05 R10) and null when the file came through untouched.
 */
export interface LogoUpload extends Branding {
  notice: string | null
}

export interface BrandingSubmission {
  companyName: string
  campaignName: string
  tagline: string
  theme: string
}

export async function fetchBranding(options?: RequestOptions): Promise<AdminBranding> {
  return apiGet<AdminBranding>('/admin/branding', options)
}

export async function saveBranding(
  submission: BrandingSubmission,
  options?: RequestOptions,
): Promise<Branding> {
  return apiPut<Branding>('/admin/branding', submission, options)
}

export async function uploadLogo(file: File, options?: RequestOptions): Promise<LogoUpload> {
  const form = new FormData()
  form.append('logo', file)

  return apiUpload<LogoUpload>('/admin/branding/logo', form, options)
}

export async function removeLogo(options?: RequestOptions): Promise<Branding> {
  return apiDelete<Branding>('/admin/branding/logo', options)
}
