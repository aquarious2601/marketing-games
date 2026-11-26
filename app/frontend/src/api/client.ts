/**
 * The one place that talks to the API.
 *
 * Everything the UI needs to know about a failure is expressed as a thrown
 * ApiError, ApiValidationError or ApiTimeoutError — never as a raw fetch
 * rejection, and never as a silent `undefined`. Callers that must not throw
 * (see `health.ts`) wrap this.
 */

export interface ApiViolation {
  /** Addressed as the client sent it: `prizes`, or `prizes[2].name`. */
  field: string
  message: string
}

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * A 422. Separate from ApiError because the caller can do something useful
 * with it — put each message against the field that caused it.
 */
export class ApiValidationError extends ApiError {
  readonly violations: ApiViolation[]

  constructor(message: string, violations: ApiViolation[]) {
    super(message, 422)
    this.name = 'ApiValidationError'
    this.violations = violations
  }
}

/**
 * A 401. Separate from ApiError because it means something the whole app
 * reacts to — the session has gone — rather than something one call failed
 * at (F07 R18, R25).
 */
export class ApiUnauthorizedError extends ApiError {
  constructor(message: string) {
    super(message, 401)
    this.name = 'ApiUnauthorizedError'
  }
}

export class ApiTimeoutError extends Error {
  readonly timeoutMs: number

  constructor(timeoutMs: number) {
    super(`The request timed out after ${timeoutMs}ms.`)
    this.name = 'ApiTimeoutError'
    this.timeoutMs = timeoutMs
  }
}

/** P00 R10: an unreachable API must not hang the UI forever. */
export const DEFAULT_TIMEOUT_MS = 5_000

/**
 * P00 R6: configurable base URL, defaulting to the same-origin `/api` that
 * the dev proxy serves. Read at call time rather than at module load so tests
 * can stub the environment.
 */
export function apiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL
  const base = configured && configured.trim() !== '' ? configured : '/api'

  return base.replace(/\/+$/, '')
}

/**
 * The language the API should answer in (F12 R8).
 *
 * A module variable rather than a parameter on every call: the locale is a
 * property of the whole session, every request wants it, and threading it
 * through forty call sites would mean the one that was forgotten answers in
 * the wrong language. `I18nProvider` sets it before the first request goes
 * out and again whenever the picker changes.
 */
let apiLocale = 'en'

export function setApiLocale(locale: string): void {
  apiLocale = locale
}

export interface RequestOptions {
  timeoutMs?: number
  /**
   * Lets the caller cancel a request it no longer wants — a component that
   * unmounted, or a load that a newer one has superseded. Without this, a
   * late response can overwrite state the user has since changed.
   */
  signal?: AbortSignal
}

export async function apiGet<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return request<T>('GET', path, undefined, options)
}

export async function apiPut<T>(
  path: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<T> {
  return request<T>('PUT', path, body, options)
}

export async function apiDelete<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return request<T>('DELETE', path, undefined, options)
}

/**
 * Multipart, for file uploads. The body is FormData, so the Content-Type
 * header is deliberately left to the browser: it has to add the multipart
 * boundary, and setting it by hand produces a request the server cannot
 * parse.
 */
export async function apiUpload<T>(
  path: string,
  form: FormData,
  options: RequestOptions = {},
): Promise<T> {
  return request<T>('POST', path, form, options)
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  return request<T>('POST', path, body, options)
}

async function request<T>(
  method: 'GET' | 'PUT' | 'POST' | 'DELETE',
  path: string,
  body: unknown,
  options: RequestOptions,
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  // The caller's signal and our timeout both feed the one controller.
  const abortFromCaller = () => controller.abort()

  if (signal !== undefined) {
    if (signal.aborted) {
      controller.abort()
    } else {
      signal.addEventListener('abort', abortFromCaller, { once: true })
    }
  }

  try {
    const multipart = body instanceof FormData

    const response = await fetch(`${apiBaseUrl()}${path}`, {
      method,
      headers:
        body === undefined || multipart
          ? { Accept: 'application/json', 'Accept-Language': apiLocale }
          : {
              Accept: 'application/json',
              'Accept-Language': apiLocale,
              'Content-Type': 'application/json',
            },
      body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw await errorFor(response)
    }

    return await readJson<T>(response)
  } catch (error) {
    // An abort we caused is a timeout; an abort we did not cause is a genuine
    // cancellation and is re-thrown untouched.
    if (timedOut) {
      throw new ApiTimeoutError(timeoutMs)
    }

    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}

/**
 * 204 is "done, and there is nothing to say".
 *
 * It carries no body at all — Symfony strips one even from a
 * `JsonResponse(null)` — so asking it for JSON throws, and every endpoint
 * that answers 204 was reporting success as "the server returned a
 * malformed response". Deleting a reward said that; so did deleting a game;
 * so did Next player, which survived only because that caller ignores
 * failures. F37 §13 records how it surfaced.
 */
const NO_CONTENT = 204

async function readJson<T>(response: Response): Promise<T> {
  if (NO_CONTENT === response.status) {
    return undefined as T
  }

  try {
    return (await response.json()) as T
  } catch {
    throw new ApiError('The server returned a malformed response.', response.status)
  }
}

interface ErrorEnvelope {
  error?: {
    message?: unknown
    violations?: unknown
  }
}

/**
 * Prefers the API's own error message, which the backend's exception listener
 * guarantees is JSON, and falls back to the status text.
 */
async function errorFor(response: Response): Promise<ApiError> {
  let envelope: ErrorEnvelope | undefined

  try {
    envelope = (await response.json()) as ErrorEnvelope
  } catch {
    // Not JSON. Fall through to the status text.
  }

  const message = messageFrom(envelope) ?? statusTextFor(response)

  if (response.status === 422) {
    return new ApiValidationError(message, violationsFrom(envelope))
  }

  if (response.status === 401) {
    // Told to anyone who registered an interest, so a session that ends
    // mid-edit surfaces as a prompt rather than as six unrelated errors.
    notifyUnauthorized()

    return new ApiUnauthorizedError(message)
  }

  return new ApiError(message, response.status)
}

function messageFrom(envelope: ErrorEnvelope | undefined): string | undefined {
  const message = envelope?.error?.message

  return typeof message === 'string' && message !== '' ? message : undefined
}

function violationsFrom(envelope: ErrorEnvelope | undefined): ApiViolation[] {
  const violations = envelope?.error?.violations

  if (!Array.isArray(violations)) {
    return []
  }

  return violations.filter(
    (violation): violation is ApiViolation =>
      typeof violation === 'object' &&
      violation !== null &&
      typeof (violation as ApiViolation).field === 'string' &&
      typeof (violation as ApiViolation).message === 'string',
  )
}

type UnauthorizedListener = () => void

const unauthorizedListeners = new Set<UnauthorizedListener>()

/**
 * Lets the session know when any request comes back 401.
 *
 * Without this, a session that ends while the admin is working shows up as
 * whatever each individual call decided to say, and the one useful fact —
 * that they are signed out — is the one thing nobody mentions.
 */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener)

  return () => unauthorizedListeners.delete(listener)
}

function notifyUnauthorized(): void {
  for (const listener of unauthorizedListeners) {
    listener()
  }
}

function statusTextFor(response: Response): string {
  return response.statusText !== ''
    ? response.statusText
    : `The request failed with status ${response.status}.`
}
