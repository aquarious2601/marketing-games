import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, ApiValidationError, type ApiViolation } from '../api/client'
import {
  createGame,
  fetchGames,
  setGameLive,
  type GameSummary,
  type GameTypeOption,
} from '../api/games'
import { useT } from '../i18n/I18nContext'

type LoadState =
  | { phase: 'loading' }
  | { phase: 'ready' }
  | { phase: 'failed' }

/**
 * The Games module (F27 R38): what this shop is running, and what it is
 * reached by.
 *
 * This is the module that replaced the old single Game module. The editor
 * for one game is a page of its own, because with two games there is no
 * longer "the" game to open — and because what a game gives away differs by
 * type, which a list has no room for.
 */
export function GamesModule() {
  const t = useT()
  const [load, setLoad] = useState<LoadState>({ phase: 'loading' })
  const [games, setGames] = useState<GameSummary[]>([])
  const [types, setTypes] = useState<GameTypeOption[]>([])
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [creating, setCreating] = useState(false)
  const [violations, setViolations] = useState<ApiViolation[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyWith, setBusyWith] = useState<number | null>(null)
  const [copied, setCopied] = useState<number | null>(null)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const loaded = await fetchGames({ signal })

      if (signal?.aborted === true) {
        return
      }

      setGames(loaded.games)
      setTypes(loaded.types)
      setType((current) => (current === '' ? (loaded.types[0]?.value ?? '') : current))
      setLoad({ phase: 'ready' })
    } catch {
      if (signal?.aborted !== true) {
        setLoad({ phase: 'failed' })
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    void refresh(controller.signal)

    return () => controller.abort()
  }, [refresh])

  const onCreate = async () => {
    setCreating(true)
    setError(null)
    setViolations([])

    try {
      await createGame({ name, type })
      setName('')
      await refresh()
    } catch (caught) {
      if (caught instanceof ApiValidationError) {
        setViolations(caught.violations)
      } else {
        setError(t('games.createFailed'))
      }
    } finally {
      setCreating(false)
    }
  }

  /**
   * F27 R42, R43. The refusal is the server's sentence, shown as it came:
   * it names the thing that is missing, which is the whole point of
   * answering with a message rather than a flag.
   */
  const onToggleLive = async (game: GameSummary) => {
    setBusyWith(game.id)
    setError(null)

    try {
      await setGameLive(game.id, !game.isLive)
      await refresh()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('games.liveFailed'))
    } finally {
      setBusyWith(null)
    }
  }

  const onCopy = async (game: GameSummary) => {
    try {
      await navigator.clipboard.writeText(game.playUrl)
      setCopied(game.id)
    } catch {
      // Copying is a convenience; the whole URL is on screen either way.
      setCopied(null)
    }
  }

  const violationFor = (field: string) =>
    violations.find((violation) => violation.field === field)?.message

  return (
    <>
      <h1 className={headingClass}>{t('games.title')}</h1>

      {load.phase === 'loading' && (
        <p role="status" className="text-sm text-slate-500">
          {t('games.loading')}
        </p>
      )}

      {load.phase === 'failed' && (
        <div role="alert" className="flex items-center gap-3">
          <p className="text-sm text-rose-600">{t('games.loadFailed')}</p>
          <button type="button" onClick={() => void refresh()} className={secondaryButtonClass}>
            {t('common.tryAgain')}
          </button>
        </div>
      )}

      {load.phase === 'ready' && (
        <>
          <section aria-label={t('games.list')} className={sectionClass} data-testid="games-list">
            {games.length === 0 ? (
              <p className="text-sm text-slate-500">{t('games.none')}</p>
            ) : (
              <ul className="divide-y divide-slate-200">
                {games.map((game) => (
                  <li key={game.id} className="py-3" data-testid={`game-${game.id}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <Link
                          to={`/admin/games/${game.id}`}
                          className="text-sm font-semibold text-slate-900 underline decoration-slate-300 hover:decoration-slate-900"
                        >
                          {game.name}
                        </Link>
                        <span className="ml-2 text-xs text-slate-500">
                          {types.find((option) => option.value === game.type)?.label ?? game.type}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span
                          data-testid={`game-${game.id}-plays`}
                          className="text-xs text-slate-500"
                        >
                          {t('games.plays', { count: game.plays })}
                        </span>

                        {/* F27 R22, R42 */}
                        <span
                          data-testid={`game-${game.id}-state`}
                          className={
                            game.isLive
                              ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800'
                              : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600'
                          }
                        >
                          {game.isLive ? t('games.live') : t('games.off')}
                        </span>

                        <button
                          type="button"
                          onClick={() => void onToggleLive(game)}
                          disabled={busyWith === game.id}
                          data-testid={`game-${game.id}-toggle`}
                          className={secondaryButtonClass}
                        >
                          {game.isLive ? t('games.turnOff') : t('games.turnLive')}
                        </button>
                      </div>
                    </div>

                    {/* F27 R41. The whole URL, because the whole URL is what
                        goes on a poster. */}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <code
                        data-testid={`game-${game.id}-link`}
                        className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-700"
                      >
                        {game.playUrl}
                      </code>
                      <button
                        type="button"
                        onClick={() => void onCopy(game)}
                        className={secondaryButtonClass}
                      >
                        {copied === game.id ? t('games.copied') : t('games.copyLink')}
                      </button>
                    </div>

                    {/* F27 R43: why it cannot go live, before anybody presses
                        the control and finds out. */}
                    {game.notReady !== null && !game.isLive && (
                      <p
                        data-testid={`game-${game.id}-not-ready`}
                        className="mt-2 text-xs text-amber-800"
                      >
                        {game.notReady}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {error !== null && (
              <p role="alert" className="mt-3 text-sm text-rose-600">
                {error}
              </p>
            )}
          </section>

          {/* F27 R39. A name and a type, and nothing else: everything else a
              game has can be filled in once it exists, and nothing can be
              played until it is turned live. */}
          <section aria-label={t('games.new')} className={sectionClass}>
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">
              {t('games.new')}
            </h2>

            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="new-game-name" className={labelClass}>
                  {t('games.name')}
                </label>
                <input
                  id="new-game-name"
                  type="text"
                  value={name}
                  maxLength={60}
                  aria-invalid={violationFor('name') !== undefined}
                  onChange={(event) => setName(event.target.value)}
                  className={inputClass}
                />
                {violationFor('name') !== undefined && (
                  <p role="alert" className="mt-1 text-xs text-rose-600">
                    {violationFor('name')}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="new-game-type" className={labelClass}>
                  {t('games.type')}
                </label>
                <select
                  id="new-game-type"
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                  className={`${inputClass} bg-white`}
                >
                  {types.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {/* F27 R5: worth saying before they choose, not after. */}
                <p className="mt-1 text-xs text-slate-500">{t('games.typeHint')}</p>
                {violationFor('type') !== undefined && (
                  <p role="alert" className="mt-1 text-xs text-rose-600">
                    {violationFor('type')}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void onCreate()}
              disabled={creating}
              data-testid="create-game"
              className={`${primaryButtonClass} mt-4`}
            >
              {creating ? t('games.creating') : t('games.create')}
            </button>
          </section>
        </>
      )}
    </>
  )
}

const headingClass = 'mb-4 text-xl font-semibold text-slate-900'
const sectionClass = 'mb-8 rounded-lg border border-slate-200 bg-white p-4 shadow-sm'
const labelClass = 'block text-xs font-medium text-slate-600'
const inputClass =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500'
const primaryButtonClass =
  'rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40'
const secondaryButtonClass =
  'rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'
