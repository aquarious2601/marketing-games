import { Fragment, useCallback, useEffect, useState } from 'react'
import {
  fetchPlayerHistory,
  fetchPlayers,
  type AdminPlayer,
  type PlayerSpin,
} from '../api/players'
import { useT, type Translate } from '../i18n/I18nContext'
import { Cell, DataTable, Row, SpanningRow, type Column } from './DataTable'
import { formatDate, formatDateTime } from './tableFormat'

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

interface OpenPlayer {
  id: number
  phase: LoadPhase
  spins: PlayerSpin[]
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
  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [players, setPlayers] = useState<AdminPlayer[]>([])
  // Held apart from `players.length`, because the list is capped and the
  // total is not (F09 R21).
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState('')
  const [open, setOpen] = useState<OpenPlayer | null>(null)

  const columns = PLAYER_COLUMNS(t)

  const load = useCallback(async (phone: string, signal?: AbortSignal) => {
    setPhase('loading')

    try {
      const list = await fetchPlayers(phone, { signal })

      if (signal?.aborted === true) {
        return
      }

      setPlayers(list.players)
      setTotal(list.total)
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

  const toggle = async (player: AdminPlayer) => {
    if (open?.id === player.id) {
      setOpen(null)

      return
    }

    setOpen({ id: player.id, phase: 'loading', spins: [] })

    try {
      const history = await fetchPlayerHistory(player.id)

      setOpen({ id: player.id, phase: 'ready', spins: history.spins })
    } catch {
      setOpen({ id: player.id, phase: 'failed', spins: [] })
    }
  }

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
        <input
          id="player-filter"
          name="player-filter"
          type="search"
          inputMode="tel"
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

      {phase === 'ready' && players.length === 0 && (
        <p className="mt-4 text-sm text-slate-500" data-testid="players-empty">
          {filter.trim() === '' ? t('players.none') : t('players.noMatch')}
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
            <Fragment key={player.id}>
              <Row testId="player-row" attrs={{ 'data-phone': player.phone }}>
                {/* F11 R12: the control that opens the row lives in the
                    first cell. A <button> cannot wrap a <tr>, and putting
                    the handler on the row itself would leave it unreachable
                    from a keyboard. */}
                <Cell strong>
                  <button
                    type="button"
                    onClick={() => void toggle(player)}
                    aria-expanded={open?.id === player.id}
                    data-testid="player-open"
                    className="w-full truncate text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  >
                    {player.firstName} {player.lastName}
                  </button>
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

              {open?.id === player.id && (
                <SpanningRow columns={columns.length} testId="player-history-row-group">
                  <History open={open} />
                </SpanningRow>
              )}
            </Fragment>
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

/** F08 R22. */
function History({ open }: { open: OpenPlayer }) {
  const t = useT()

  if (open.phase === 'loading') {
    return (
      <p role="status" className="pb-3 text-sm text-slate-500">
        {t('players.historyLoading')}
      </p>
    )
  }

  if (open.phase === 'failed') {
    return (
      <p role="alert" className="pb-3 text-sm text-rose-600">
        {t('players.historyFailed')}
      </p>
    )
  }

  if (open.spins.length === 0) {
    return (
      <p className="pb-3 text-sm text-slate-500" data-testid="player-history-empty">
        {t('players.historyNone')}
      </p>
    )
  }

  return (
    // A table of its own, with its own two labelled columns (F11 R2): the
    // history is a different shape from the list above it, and borrowing
    // that list's five columns would mean two of them labelled for a player
    // and three of them empty.
    <table
      aria-label={t('players.history')}
      data-testid="player-history"
      className="w-full table-fixed border-collapse rounded-md bg-white text-sm"
    >
      <colgroup>
        <col style={{ width: '60%' }} />
        <col style={{ width: '40%' }} />
      </colgroup>
      <thead>
        <tr className="border-b border-slate-200">
          <th
            scope="col"
            className="pb-1.5 pr-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500"
          >
            {t('spins.colPrize')}
          </th>
          <th
            scope="col"
            className="pb-1.5 text-right text-xs font-semibold uppercase tracking-[0.08em] text-slate-500"
          >
            {t('spins.colSpun')}
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {open.spins.map((spin) => (
          <tr key={spin.id} data-testid="player-history-row">
            <td className="truncate py-1.5 pr-3 text-slate-900" title={spin.prizeName}>
              {spin.prizeName}
            </td>
            <td className="truncate py-1.5 text-right text-xs tabular-nums text-slate-500">
              {formatDateTime(spin.spunAt)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const sectionClass = 'mb-8 rounded-lg border border-slate-200 bg-white p-4 shadow-sm'
const labelClass = 'block text-xs font-medium text-slate-600'
const inputClass =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500'
const secondaryButtonClass =
  'rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50'
