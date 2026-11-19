import { useCallback, useEffect, useState } from 'react'
import {
  fetchSpinLog,
  setSpinClaimed,
  type ClaimState,
  type LoggedSpin,
} from '../api/players'
import { useT, type Translate } from '../i18n/I18nContext'
import { Cell, DataTable, Row, type Column } from './DataTable'
import { EMPTY, formatDateTime } from './tableFormat'

/**
 * F11 R2, R3, R13. Prize first, because that is what the log is a record of;
 * then who, then when.
 *
 * "Phone" and "Spun" mean here exactly what they mean in the players table
 * and in a player's history, which is the point of one shared table.
 */
const SPIN_COLUMNS = (t: Translate): Column[] => [
  { key: 'prize', label: t('spins.colPrize'), width: '18%' },
  // F27 R44. Second, beside the prize: the two together are what a row is —
  // what went out, and which promotion gave it away.
  { key: 'game', label: t('spins.colGame'), width: '14%' },
  { key: 'player', label: t('spins.colPlayer'), width: '14%' },
  { key: 'phone', label: t('spins.colPhone'), width: '14%' },
  { key: 'code', label: t('spins.colCode'), width: '12%' },
  { key: 'spun', label: t('spins.colSpun'), width: '14%' },
  { key: 'status', label: t('spins.colStatus'), width: '12%' },
  // F31 R19. Beside the status, because the two are one fact: handed
  // over, and by whom.
  { key: 'claimedBy', label: t('spins.colClaimedBy'), width: '12%' },
]

type LoadPhase = 'loading' | 'ready' | 'failed'

/**
 * The Spins module: the whole log, newest first (F09 R13–R19).
 *
 * This answers the question the per-player history cannot — "what went out
 * today", asked at the end of a shift with no particular person in mind. See
 * F09 R12 for why both exist.
 *
 * Wins only, since F31 R23: a losing spin has no code, nothing to hand
 * over and no control on it, and its reason for being here was
 * completeness. The header says how many were left out (R24), and the
 * stats are where they are read properly.
 *
 * Still deliberately without a row of totals at the top. Customers,
 * collection rates and what a campaign costs are F32, which counts them
 * per day and per game rather than as three numbers over a log.
 */
export function SpinsModule() {
  const t = useT()
  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [spins, setSpins] = useState<LoggedSpin[]>([])
  // Held apart from `spins.length`, because the log is capped and the total
  // is not (F09 R16).
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState('')
  // F27 R44. Null is every game, which is the right default for a log:
  // a promotion being over is no reason to hide what it gave away.
  const [game, setGame] = useState<number | null>(null)
  const [games, setGames] = useState<Array<{ id: number; name: string }>>([])
  const [claimError, setClaimError] = useState<string | null>(null)
  // F31 R24. How many of the matching spins won nothing: the rows this
  // list no longer carries, counted so it cannot pretend to be complete.
  const [wonNothing, setWonNothing] = useState(0)
  // F31 R25. Everything by default: the module's question is what went
  // out, and the counter's question has a screen of its own now.
  const [status, setStatus] = useState<ClaimState>('all')

  const columns = SPIN_COLUMNS(t)

  /**
   * F13 R22, R23. The row is replaced with what the server returned rather
   * than the whole log reloaded: a counter is a place where the list should
   * not jump under somebody's finger between two taps.
   */
  const onClaim = async (spin: LoggedSpin) => {
    setClaimError(null)

    try {
      const updated = await setSpinClaimed(spin.id, spin.claimedAt === null)

      setSpins((current) => current.map((row) => (row.id === updated.id ? updated : row)))
    } catch {
      setClaimError(t('spins.claimFailed'))
    }
  }

  const load = useCallback(
    async (
      phone: string,
      forGame: number | null,
      forStatus: ClaimState,
      signal?: AbortSignal,
    ) => {
      setPhase('loading')

      try {
        const log = await fetchSpinLog(phone, forGame, forStatus, { signal })

        if (signal?.aborted === true) {
          return
        }

        setSpins(log.spins)
        setTotal(log.total)
        setWonNothing(log.wonNothing)
        // F27 R44: the selector's options come with the log.
        setGames(log.games)
        setPhase('ready')
      } catch {
        if (signal?.aborted === true) {
          return
        }

        setPhase('failed')
      }
    },
    [],
  )

  /**
   * Refetched as the filter changes, after a pause.
   *
   * Server-side rather than filtering the loaded array, for the same reason
   * as the player list: the log is capped, so filtering what happens to be
   * loaded would quietly search the most recent page only and would start
   * giving wrong answers at exactly the point the shop had enough history to
   * need a filter.
   */
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(
      () => void load(filter, game, status, controller.signal),
      filter === '' ? 0 : 250,
    )

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [filter, game, load, status])

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {t('spins.title')}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t('spins.lead')}
        </p>
      </header>

      <section aria-label={t('spins.log')} className={sectionClass} data-testid="spins-section">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">
            {t('spins.log')}
          </h2>
          <span className="text-xs text-slate-500" data-testid="spins-total">
            {total === 1 ? t('spins.countOne') : t('spins.count', { count: total })}
          </span>
        </div>

        {/* F27 R44. Beside the search box rather than above it: both narrow
            the same list, and an admin reaches for whichever matches the
            question they have. */}
        {games.length > 1 && (
          <div className="mt-4">
            <label htmlFor="spin-game" className={labelClass}>
              {t('spins.gameLabel')}
            </label>
            <select
              id="spin-game"
              value={game === null ? '' : String(game)}
              onChange={(event) =>
                setGame(event.target.value === '' ? null : Number(event.target.value))
              }
              data-testid="spin-game-filter"
              className={`${inputClass} bg-white`}
            >
              {/* Every game, and the default: a log is a record, so hiding a
                  finished promotion's rows would be hiding what it gave. */}
              <option value="">{t('spins.allGames')}</option>
              {games.map((each) => (
                <option key={each.id} value={each.id}>
                  {each.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* F31 R25. Three views of one list: what went out, what is
            still owed, and what has been handed over. */}
        <div className="mt-4">
          <label htmlFor="spin-status" className={labelClass}>
            {t('spins.statusLabel')}
          </label>
          <select
            id="spin-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as ClaimState)}
            data-testid="spin-status-filter"
            className={`${inputClass} bg-white`}
          >
            <option value="all">{t('spins.statusAll')}</option>
            <option value="open">{t('spins.statusOpen')}</option>
            <option value="claimed">{t('spins.statusClaimed')}</option>
          </select>
        </div>

        <div className="mt-4">
          <label htmlFor="spin-filter" className={labelClass}>
            {t('spins.filterLabel')}
          </label>
          {/* F16 R7: one box for both, and so no `inputMode="tel"` — a
              numeric keypad cannot type a code. The server normalises the
              case and the hyphen (R8), so nothing here has to. */}
          <input
            id="spin-filter"
            name="spin-filter"
            type="search"
            placeholder={t('spins.filterPlaceholder')}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            data-testid="spin-filter"
            className={inputClass}
          />
        </div>

        {phase === 'loading' && (
          <p role="status" className="mt-4 text-sm text-slate-500">
            {t('spins.loading')}
          </p>
        )}

        {phase === 'failed' && (
          <div role="alert" className="mt-4 flex items-center gap-3">
            <p className="text-sm text-rose-600">{t('spins.loadFailed')}</p>
            <button
              type="button"
              onClick={() => void load(filter, game, status)}
              className={secondaryButtonClass}
            >
              {t('common.tryAgain')}
            </button>
          </div>
        )}

        {/* F09 R19: two different facts, two different messages. */}
        {phase === 'ready' && spins.length === 0 && (
          <p className="mt-4 text-sm text-slate-500" data-testid="spins-empty">
            {filter.trim() === '' ? t('spins.none') : t('spins.noMatch')}
          </p>
        )}

        {phase === 'ready' && spins.length > 0 && (
          <DataTable
            label={t('spins.log')}
            columns={columns}
            minWidth="52rem"
            testId="spin-log"
          >
            {spins.map((spin) => (
              <Row key={spin.id} testId="spin-row">
                <Cell strong>{spin.prizeName}</Cell>

                {/* F27 R44: which promotion gave it away. */}
                <Cell testId="spin-game">{spin.game}</Cell>

                {/* F09 R15 with F11 §9: a dash, not an empty cell. An empty
                    cell is ambiguous between "no value" and "we failed to
                    load it"; a dash says the question was asked and the
                    answer is nothing — which for a player who exercised
                    their right to be deleted is exactly the fact. */}
                {spin.player === null ? (
                  <>
                    <Cell muted testId="spin-anonymous">
                      {EMPTY}
                    </Cell>
                    <Cell muted>{EMPTY}</Cell>
                  </>
                ) : (
                  <>
                    <Cell testId="spin-player">
                      {spin.player.firstName} {spin.player.lastName}
                    </Cell>
                    <Cell mono>{spin.player.phone}</Cell>
                  </>
                )}

                {/* F16 R2: a dash is a spin that won nothing — and, until
                    the pre-F16 rows fall off the first page, a free product
                    from before every win carried a code (R5). */}
                <Cell mono testId="spin-code">
                  {spin.code ?? EMPTY}
                </Cell>

                <Cell numeric muted>
                  {formatDateTime(spin.spunAt)}
                </Cell>

                {/* F13 R24: a losing row offers nothing to press, because
                    there is nothing to hand over. */}
                <Cell testId="spin-status">
                  {!spin.claimable ? (
                    <span className="text-slate-400">{EMPTY}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void onClaim(spin)}
                      data-testid="spin-claim"
                      aria-pressed={spin.claimedAt !== null}
                      className={
                        spin.claimedAt !== null
                          ? 'rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100'
                          : 'rounded-full border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50'
                      }
                    >
                      {spin.claimedAt !== null ? t('spins.claimed') : t('spins.claim')}
                    </button>
                  )}
                </Cell>

                {/* F31 R22: a dash for a claim nobody signed — every one
                    made before F31 — rather than a name nobody can
                    stand behind. */}
                <Cell muted testId="spin-claimed-by">
                  {spin.claimedBy ?? EMPTY}
                </Cell>
              </Row>
            ))}
          </DataTable>
        )}

        {claimError !== null && (
          <p role="alert" className="mt-3 text-sm text-rose-600" data-testid="spins-claim-error">
            {claimError}
          </p>
        )}

        {/* F31 R24. The list is wins only, and this is what stops that
            being a log quietly leaving things out. */}
        {phase === 'ready' && wonNothing > 0 && (
          <p className="mt-3 text-xs text-slate-500" data-testid="spins-won-nothing">
            {wonNothing === 1
              ? t('spins.wonNothingOne')
              : t('spins.wonNothing', { count: wonNothing })}
          </p>
        )}

        {/* F09 R16: a capped list must never present itself as the whole. */}
        {phase === 'ready' && total > spins.length && (
          <p className="mt-3 text-xs text-slate-500" data-testid="spins-capped">
            {t('spins.capped', { shown: spins.length, total })}
          </p>
        )}
      </section>
    </>
  )
}

const sectionClass = 'mb-8 rounded-lg border border-slate-200 bg-white p-4 shadow-sm'
const labelClass = 'block text-xs font-medium text-slate-600'
const inputClass =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500'
const secondaryButtonClass =
  'rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50'
