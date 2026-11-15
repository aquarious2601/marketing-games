import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, ApiTimeoutError, apiBaseUrl, apiGet } from './client'

/** A minimal stand-in for Response — enough for the client, no network. */
function jsonResponse(body: unknown, init: { status?: number; statusText?: string } = {}): Response {
  const status = init.status ?? 200

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: init.statusText ?? '',
    json: async () => body,
  } as unknown as Response
}

/** Mimics an HTML error page arriving where JSON was promised. */
function malformedResponse(status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON at position 0')
    },
  } as unknown as Response
}

function stubFetch(response: Response) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response)
  vi.stubGlobal('fetch', fetchMock)

  return fetchMock
}

afterEach(() => {
  vi.useRealTimers()
})

describe('apiBaseUrl', () => {
  it('defaults to the same-origin /api path', () => {
    vi.stubEnv('VITE_API_BASE_URL', '')

    expect(apiBaseUrl()).toBe('/api')
  })

  it('honours VITE_API_BASE_URL and strips any trailing slash', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/v1/')

    expect(apiBaseUrl()).toBe('https://api.example.com/v1')
  })
})

describe('apiGet', () => {
  it('requests the path against the base URL and returns the parsed body', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    const fetchMock = stubFetch(jsonResponse({ status: 'ok' }))

    await expect(apiGet<{ status: string }>('/health')).resolves.toEqual({ status: 'ok' })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.anything())
  })

  it('throws an ApiError carrying the status and the API message on a 4xx', async () => {
    stubFetch(
      jsonResponse(
        { error: { status: 404, message: 'No route found for "GET /api/nope"' } },
        { status: 404, statusText: 'Not Found' },
      ),
    )

    const error = await apiGet('/nope').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(404)
    expect((error as ApiError).message).toBe('No route found for "GET /api/nope"')
  })

  it('falls back to the status text when the error body carries no message', async () => {
    stubFetch(jsonResponse({ unexpected: true }, { status: 503, statusText: 'Service Unavailable' }))

    const error = await apiGet('/health').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toBe('Service Unavailable')
  })

  it('throws an ApiError when a successful response is not valid JSON', async () => {
    stubFetch(malformedResponse(200))

    const error = await apiGet('/health').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toMatch(/malformed/i)
  })

  it('throws an ApiTimeoutError once the timeout elapses', async () => {
    vi.useFakeTimers()

    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const pending = apiGet('/health', { timeoutMs: 1_000 })
    const assertion = expect(pending).rejects.toBeInstanceOf(ApiTimeoutError)

    await vi.advanceTimersByTimeAsync(1_000)
    await assertion
  })

  it('does not leave a pending timer behind after a successful call', async () => {
    vi.useFakeTimers()
    stubFetch(jsonResponse({ status: 'ok' }))

    await apiGet('/health', { timeoutMs: 1_000 })

    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborts when the caller cancels, without reporting a timeout', async () => {
    const controller = new AbortController()

    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const pending = apiGet('/health', { signal: controller.signal })
    const assertion = expect(pending).rejects.toThrow(/abort/i)

    controller.abort()

    await assertion
    await expect(pending).rejects.not.toBeInstanceOf(ApiTimeoutError)
  })

  it('does not even start when the caller has already cancelled', async () => {
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })

          if (init?.signal?.aborted === true) {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          }
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      apiGet('/health', { signal: AbortSignal.abort() }),
    ).rejects.toThrow(/abort/i)
  })

  it('surfaces a network failure as the original error, not as a timeout', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    vi.stubGlobal('fetch', fetchMock)

    const error = await apiGet('/health').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TypeError)
    expect(error).not.toBeInstanceOf(ApiTimeoutError)
  })
})
