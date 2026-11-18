import { useCallback, useEffect, useState } from 'react'
import { fetchSpinLog, setSpinClaimed, type LoggedSpin } from '../api/players'
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
  { key: 'prize', label: t('spins.colPrize'), width: '20%' },
  { key: 'player', label: t('spins.colPlayer'), width: '16%' },
  { key: 'phone', label: t('spins.colPhone'), width: '16%' },
  { key: 'code', label: t('spins.colCode'), width: '14%' },
  { key: 'spun', label: t('spins.colSpun'), width: '18%' },
  { key: 'status', label: t('spins.colStatus'), width: '16%' },
]

type LoadPhase = 'loading' | 'ready' | 'failed'

/**
 * The Spins module: the whole log, newest first (F09 R13–R19).
 *
 * This answers the question the per-player history cannot — "what went out
 * today", asked at the end of a shift with no particular person in mind. See
 * F09 R12 for why both exist.
 *
 * Deliberately without a row of totals at the top. Spins today, unique
 * players and prizes given are the obvious next thing to want, and they are
 * the Dashboard feature; "unique players" in particular cannot be counted
 * honestly yet, because F08 canonicalises phone numbers loosely and one
 * person with two spellings is two rows. A number that is wrong in a way
 * nobody can see is worse than no number.
 */
export function SpinsModule() {
  const t = useT()
  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [spins, setSpins] = useState<LoggedSpin[]>([])
  // Held apart from `spins.length`, because the log is capped and the total
  // is not (F09 R16).
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState('')
  const [claimError, setClaimError] = useState<string | null>(null)

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

  const load = useCallback(async (phone: string, signal?: AbortSignal) => {
    setPhase('loading')

    try {
      const log = await fetchSpinLog(phone, { signal })

      if (signal?.aborted === true) {
        return
      }

      setSpins(log.spins)
      setTotal(log.total)
      setPhase('ready')
    } catch {
      if (signal?.aborted === true) {
        return
      }

      setPhase('failed')
    }
  }, [])

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
    const timer = setTimeout(() => void load(filter, controller.signal), filter === '' ? 0 : 250)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [filter, load])

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
            <button type="button" onClick={() => void load(filter)} className={secondaryButtonClass}>
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
              </Row>
            ))}
          </DataTable>
        )}

        {claimError !== null && (
          <p role="alert" className="mt-3 text-sm text-rose-600" data-testid="spins-claim-error">
            {claimError}
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
