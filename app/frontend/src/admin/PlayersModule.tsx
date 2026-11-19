import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { fetchPlayers, type AdminPlayer } from '../api/players'
import { useT, type Translate } from '../i18n/I18nContext'
import { Cell, DataTable, Row, type Column } from './DataTable'
import { formatDate } from './tableFormat'

/**
 * F11 R2, R3, R5. The widths are percentages of one fixed-layout table, so
 * they are a declaration of where each field sits rather than a hint.
 *
 * Name is widest because two names and a space is the longest value here;
 * Spins is narrow and right-aligned because it is a count.
 */
const PLAYER_COLUMNS = (t: Translate): Column[] => [
  { key: 'name', label: t('players.colName'), width: '28%' },
  { key: 'phone', label: t('players.colPhone'), width: '20%' },
  { key: 'birthday', label: t('players.colBirthday'), width: '16%' },
  { key: 'joined', label: t('players.colJoined'), width: '18%' },
  { key: 'spins', label: t('players.colSpins'), width: '18%', align: 'right' },
]

type LoadPhase = 'loading' | 'ready' | 'failed'

/**
 * F13 R18's alphabet, and F16 R8's normalising, as the page needs it.
 *
 * Only to decide whether what has been typed is a *complete* code, which is
 * the one thing the page acts on by itself (R6). Matching is the server's
 * job — this is about whether the ticket in somebody's hand has been typed
 * in full.
 */
const CODE_LENGTH = 8
const CODE_ALPHABET = /^[A-HJ-KM-NP-Z2-9]+$/

function isACompleteCode(typed: string): boolean {
  const bare = typed.replace(/[\s-]/g, '').toUpperCase()

  return bare.length === CODE_LENGTH && CODE_ALPHABET.test(bare)
}

/**
 * The Players module: who played, and what each of them won (F08 R20–R22).
 *
 * The history opens inside the row it belongs to, because the question the
 * admin is answering is asked at a counter with somebody waiting — "did this
 * number already win the voucher?" — and a page they have to come back from
 * loses the filter they typed to find the row in the first place.
 *
 * It keeps that per-player history even though F09 added the whole spin log
 * (F09 R12). The two answer different questions: this one is "what did this
 * person win", asked with a customer standing there; the log is "what went
 * out today", asked at the end of a shift. Neither is the other with a
 * filter applied.
 *
 * Read-only on purpose (F08 section 5): deleting a player is served from the
 * console until there is a feature that says what that should do to their
 * spins.
 */
export function PlayersModule() {
  const t = useT()
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams()
  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [players, setPlayers] = useState<AdminPlayer[]>([])
  // Held apart from `players.length`, because the list is capped and the
  // total is not (F09 R21).
  const [total, setTotal] = useState(0)
  // F31 R7: nothing matched, and the reason is a prize nobody owns.
  const [orphan, setOrphan] = useState(false)

  /*
   * The filter lives in the URL (F31 R1, R18).
   *
   * Opening a customer is a page of its own now, and F09 R12 kept the
   * history inside the row precisely so that opening it could not lose the
   * search somebody typed to find it. Carrying the search in the query
   * string keeps that true: the customer's page links back with it, and a
   * staff member can bookmark or reload mid-queue.
   */
  const filter = search.get('search') ?? ''

  const setFilter = (typed: string) => {
    setSearch(typed === '' ? {} : { search: typed }, { replace: true })
  }

  const columns = PLAYER_COLUMNS(t)

  const load = useCallback(async (typed: string, signal?: AbortSignal) => {
    setPhase('loading')

    try {
      const list = await fetchPlayers(typed, { signal })

      if (signal?.aborted === true) {
        return
      }

      setPlayers(list.players)
      setTotal(list.total)
      setOrphan(list.winWithoutCustomer)
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
   * Server-side rather than filtering the loaded array, because the list is
   * capped (`PlayerRepository::LIST_LIMIT`): filtering what happens to be
   * loaded would quietly search the first page only, and would start
   * returning wrong answers at exactly the point the shop had enough players
   * to need a filter. The pause keeps a four-digit search to one request
   * instead of four.
   */
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => void load(filter, controller.signal), filter === '' ? 0 : 250)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [filter, load])

  /**
   * R6. A ticket is one action: a complete code that found exactly one
   * customer opens that customer.
   *
   * Narrowed to a complete code while building. R6 says "matches exactly
   * one customer", which taken literally would navigate away mid-typing as
   * soon as a phone fragment happened to match one person — taking the box
   * being typed into with it. A code is the case the rule exists for, and
   * it is the one input that is finished when it matches.
   */
  useEffect(() => {
    if (phase !== 'ready' || players.length !== 1 || !isACompleteCode(filter)) {
      return
    }

    void navigate(customerPath(players[0].id, filter))
  }, [filter, navigate, phase, players])

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {t('players.title')}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t('players.lead')}
        </p>
      </header>

      <section aria-label={t('players.title')} className={sectionClass} data-testid="players-section">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">
          {t('players.list')}
        </h2>
        {/* F09 R21: the server's count of what matches, not the length of
            the page it sent. The two differ as soon as a shop has more
            players than PlayerRepository::LIST_LIMIT. */}
        <span className="text-xs text-slate-500" data-testid="players-total">
          {total === 1 ? t('players.countOne') : t('players.count', { count: total })}
        </span>
      </div>

      <div className="mt-4">
        <label htmlFor="player-filter" className={labelClass}>
          {t('players.filterLabel')}
        </label>
        {/* F31 R1: one box, a number or a code. `inputMode` is deliberately
            not `tel` any more — half of what gets typed here is letters. */}
        <input
          id="player-filter"
          name="player-filter"
          type="search"
          placeholder={t('players.filterPlaceholder')}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          data-testid="player-filter"
          className={inputClass}
        />
      </div>

      {phase === 'loading' && (
        <p role="status" className="mt-4 text-sm text-slate-500">
          {t('players.loading')}
        </p>
      )}

      {phase === 'failed' && (
        <div role="alert" className="mt-4 flex items-center gap-3">
          <p className="text-sm text-rose-600">{t('players.loadFailed')}</p>
          <button type="button" onClick={() => void load(filter)} className={secondaryButtonClass}>
            {t('common.tryAgain')}
          </button>
        </div>
      )}

      {phase === 'ready' && players.length === 0 && !orphan && (
        <p className="mt-4 text-sm text-slate-500" data-testid="players-empty">
          {filter.trim() === '' ? t('players.none') : t('players.noMatch')}
        </p>
      )}

      {/* F31 R7. The code names a win the database cannot attach to anybody
          — one from before F08, or one whose customer was deleted. The shop
          still owes somebody that prize, so this says where it can be
          handed over instead of reporting a flat nothing. */}
      {phase === 'ready' && orphan && (
        <p className="mt-4 text-sm text-slate-700" data-testid="players-orphan-win">
          {t('players.winWithoutCustomer')}{' '}
          <Link to="/admin/spins" className="font-medium text-sky-700 underline-offset-2 hover:underline">
            {t('spins.title')}
          </Link>
        </p>
      )}

      {phase === 'ready' && players.length > 0 && (
        <DataTable
          label={t('players.title')}
          columns={columns}
          minWidth="44rem"
          testId="player-list"
        >
          {players.map((player) => (
            <Row key={player.id} testId="player-row" attrs={{ 'data-phone': player.phone }}>
                {/* F11 R12: the control that opens the row lives in the
                    first cell. A <button> cannot wrap a <tr>, and putting
                    the handler on the row itself would leave it unreachable
                    from a keyboard. */}
                <Cell strong>
                  {/* F31 R10. A link rather than the row's own expander:
                      the customer is a page now, because a control somebody
                      has to press at a counter cannot live inside a table
                      that scrolls sideways on a phone (R29). */}
                  <Link
                    to={customerPath(player.id, filter)}
                    data-testid="player-open"
                    className="block w-full truncate text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  >
                    {player.firstName} {player.lastName}
                  </Link>
                </Cell>
                <Cell mono>{player.phone}</Cell>
                <Cell numeric muted>
                  {formatDate(player.birthday)}
                </Cell>
                <Cell numeric muted>
                  {formatDate(player.createdAt)}
                </Cell>
                {/* F11 R5: a count is a number, so it is right-aligned, and
                    the header above it is too — DataTable takes that from
                    the column definition. */}
                <Cell align="right" numeric strong testId="player-spin-count">
                  {player.spinCount}
                </Cell>
            </Row>
          ))}
        </DataTable>
      )}

      {/* F09 R16: a capped list must never present itself as the whole. */}
      {phase === 'ready' && total > players.length && (
        <p className="mt-3 text-xs text-slate-500" data-testid="players-capped">
          {t('players.capped', { shown: players.length, total })}
        </p>
      )}
      </section>
    </>
  )
}

/**
 * The customer's page, carrying the search that found them (R18).
 *
 * One place, because the row's link and R6's automatic open must agree:
 * two spellings of this would mean the back link worked from one of them.
 */
function customerPath(id: number, filter: string): string {
  return `/admin/players/${id}${filter === '' ? '' : `?search=${encodeURIComponent(filter)}`}`
}

const sectionClass = 'mb-8 rounded-lg border border-slate-200 bg-white p-4 shadow-sm'
const labelClass = 'block text-xs font-medium text-slate-600'
const inputClass =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500'
const secondaryButtonClass =
  'rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50'
