import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  fetchCustomer,
  setSpinClaimed,
  type CustomerDetail,
  type CustomerWin,
} from '../api/players'
import { useT } from '../i18n/I18nContext'
import { formatDate, formatDateTime } from './tableFormat'

type LoadPhase = 'loading' | 'ready' | 'failed'

/**
 * One customer, and everything they are owed (F31 R10–R18).
 *
 * This is the counter's screen. A customer arrives with a ticket or with the
 * number they played on, staff find them on the list before this one, and
 * everything they have won is here in two groups: what is still to collect,
 * and what has already gone over the counter.
 *
 * Cards rather than a table, deliberately. The admin's tables scroll
 * sideways on a phone (F11), which is the right answer for a log somebody
 * reads and the wrong one for a control somebody has to reach while a
 * customer waits (R29). One card, one prize, one button.
 */
export function CustomerModule() {
  const t = useT()
  const { id } = useParams()
  const [search] = useSearchParams()
  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [detail, setDetail] = useState<CustomerDetail | null>(null)

  const customerId = Number(id)

  const load = useCallback(async (signal?: AbortSignal) => {
    setPhase('loading')

    try {
      const loaded = await fetchCustomer(customerId, { signal })

      if (signal?.aborted === true) {
        return
      }

      setDetail(loaded)
      setPhase('ready')
    } catch {
      if (signal?.aborted === true) {
        return
      }

      setPhase('failed')
    }
  }, [customerId])

  useEffect(() => {
    const controller = new AbortController()

    void load(controller.signal)

    return () => controller.abort()
  }, [load])

  /**
   * R18. The card moves from one group to the other in place: the server's
   * answer replaces the one win it is about, and nothing else on the screen
   * is reloaded — so the list behind this page keeps the search that found
   * the customer, and the page keeps its scroll position.
   */
  const replace = (win: CustomerWin) => {
    setDetail((current) =>
      current === null
        ? current
        : {
            ...current,
            wins: current.wins.map((each) => (each.id === win.id ? win : each)),
          },
    )
  }

  /**
   * R1, R18. Back to the list with the search still in it.
   *
   * The filter travels in the URL rather than in component state, which is
   * what makes this page affordable at all: F09 R12 kept the history inside
   * the row precisely so that opening it could not lose the search, and
   * carrying the search in the link keeps that true for a page.
   */
  const backTo = `/admin/players${search.has('search') ? `?search=${encodeURIComponent(search.get('search') ?? '')}` : ''}`

  return (
    <>
      <header className="mb-6">
        <Link
          to={backTo}
          data-testid="back-to-customers"
          className="text-xs font-medium text-sky-700 underline-offset-2 hover:underline"
        >
          {t('customer.back')}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {phase === 'ready' && detail !== null
            ? `${detail.player.firstName} ${detail.player.lastName}`
            : t('customer.title')}
        </h1>
      </header>

      {phase === 'loading' && (
        <p role="status" className="text-sm text-slate-500">
          {t('customer.loading')}
        </p>
      )}

      {phase === 'failed' && (
        <div role="alert" className="flex items-center gap-3">
          <p className="text-sm text-rose-600">{t('customer.loadFailed')}</p>
          <button type="button" onClick={() => void load()} className={secondaryButtonClass}>
            {t('common.tryAgain')}
          </button>
        </div>
      )}

      {phase === 'ready' && detail !== null && (
        <Customer detail={detail} onClaimed={replace} />
      )}
    </>
  )
}

function Customer({
  detail,
  onClaimed,
}: {
  detail: CustomerDetail
  onClaimed: (win: CustomerWin) => void
}) {
  const t = useT()

  const toCollect = detail.wins.filter((win) => win.claimedAt === null)
  const collected = detail.wins.filter((win) => win.claimedAt !== null)

  return (
    <>
      {/* R10. Who they are, and R13's two counts: the plays that won nothing
          are not listed anywhere, so the page says how many there were. */}
      <section aria-label={t('customer.who')} className={sectionClass} data-testid="customer-who">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <Fact label={t('players.colPhone')} value={detail.player.phone} mono testId="customer-phone" />
          <Fact label={t('players.colJoined')} value={formatDate(detail.player.createdAt)} />
          <Fact
            label={t('customer.plays')}
            value={t('customer.playsValue', { played: detail.played, won: detail.won })}
            testId="customer-plays"
          />
        </dl>
      </section>

      <Group
        heading={t('customer.toCollect')}
        testId="to-collect"
        wins={toCollect}
        empty={t('customer.nothingToCollect')}
        onClaimed={onClaimed}
      />

      <Group
        heading={t('customer.collected')}
        testId="collected"
        wins={collected}
        empty={t('customer.nothingCollected')}
        onClaimed={onClaimed}
      />
    </>
  )
}

/**
 * R11, R14. One group, its wins newest first, sheets grouped.
 *
 * A gift sheet issues several rewards at once (F28), so six cards from one
 * play would read as six separate visits. They are grouped under the sheet
 * and each keeps its own control, because they are handed over one at a
 * time.
 */
function Group({
  heading,
  testId,
  wins,
  empty,
  onClaimed,
}: {
  heading: string
  testId: string
  wins: CustomerWin[]
  empty: string
  onClaimed: (win: CustomerWin) => void
}) {
  const t = useT()

  return (
    <section aria-label={heading} className={sectionClass} data-testid={`${testId}-section`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">
          {heading}
        </h2>
        <span className="text-xs text-slate-500" data-testid={`${testId}-count`}>
          {wins.length}
        </span>
      </div>

      {wins.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500" data-testid={`${testId}-empty`}>
          {empty}
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {groupBySheet(wins).map((group) => (
            <div key={group.key} data-testid={group.sheet === null ? 'win-group' : 'sheet-group'}>
              {group.sheet !== null && (
                <p className="mb-2 text-xs font-medium text-slate-500" data-testid="sheet-label">
                  {t('customer.sheet', { count: group.wins.length })}
                </p>
              )}
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {group.wins.map((win) => (
                  <WinCard key={win.id} win={win} onClaimed={onClaimed} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** R12, R15, R16. One prize, and one deliberate press. */
function WinCard({
  win,
  onClaimed,
}: {
  win: CustomerWin
  onClaimed: (win: CustomerWin) => void
}) {
  const t = useT()
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const collected = win.claimedAt !== null

  const press = async () => {
    setSaving(true)
    setFailed(false)

    try {
      const saved = await setSpinClaimed(win.id, !collected)

      onClaimed({ ...win, claimedAt: saved.claimedAt, claimedBy: saved.claimedBy })
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <li
      data-testid="win-card"
      data-collected={collected}
      className={`rounded-lg border p-4 ${collected ? 'border-slate-200 bg-slate-50' : 'border-slate-300 bg-white shadow-sm'}`}
    >
      <p
        className={`text-base font-semibold ${collected ? 'text-slate-600' : 'text-slate-900'}`}
        data-testid="win-prize"
      >
        {win.prizeName}
      </p>

      {/* R17. A win from before F16 has no code and is collected like any
          other: the code is how a win is found, not what makes it real. */}
      {win.code !== null && (
        <p className="mt-1 font-mono text-sm tracking-wide text-slate-700" data-testid="win-code">
          {win.code}
        </p>
      )}

      <p className="mt-2 text-xs text-slate-500">
        <span data-testid="win-game">{win.game}</span>
        {' · '}
        <span data-testid="win-spun">{formatDateTime(win.spunAt)}</span>
      </p>

      {collected && (
        <p className="mt-2 text-xs text-slate-500" data-testid="win-collected-by">
          {t('customer.collectedBy', {
            when: formatDateTime(win.claimedAt ?? ''),
            // R22: a claim nobody signed shows a dash rather than a guess.
            who: win.claimedBy ?? '—',
          })}
        </p>
      )}

      {failed && (
        <p role="alert" className="mt-2 text-xs text-rose-600" data-testid="win-failed">
          {t('spins.claimFailed')}
        </p>
      )}

      {/* R29. Full width and at the bottom of the card, where a thumb is. */}
      <button
        type="button"
        onClick={() => void press()}
        disabled={saving}
        data-testid={collected ? 'win-undo' : 'win-hand-over'}
        className={`mt-3 w-full rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-60 ${
          collected
            ? 'border border-slate-300 text-slate-700 hover:bg-white'
            : 'bg-sky-700 text-white hover:bg-sky-800'
        }`}
      >
        {collected ? t('customer.undo') : t('customer.handOver')}
      </button>
    </li>
  )
}

function Fact({
  label,
  value,
  mono = false,
  testId,
}: {
  label: string
  value: string
  mono?: boolean
  testId?: string
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd
        className={`mt-0.5 text-slate-900 ${mono ? 'font-mono' : ''}`}
        data-testid={testId}
      >
        {value}
      </dd>
    </div>
  )
}

interface WinGroup {
  key: string
  sheet: string | null
  wins: CustomerWin[]
}

/**
 * R14. Consecutive wins from one sheet become one group.
 *
 * Consecutive rather than gathered from the whole list, because the wins
 * arrive newest first and a sheet's rows are written together: grouping by
 * key alone would pull an old sheet up beside a new one and quietly reorder
 * the page.
 */
function groupBySheet(wins: CustomerWin[]): WinGroup[] {
  const groups: WinGroup[] = []

  for (const win of wins) {
    const last = groups.at(-1)

    if (win.sheetId !== null && last?.sheet === win.sheetId) {
      last.wins.push(win)

      continue
    }

    groups.push({
      key: win.sheetId ?? `win-${win.id}`,
      sheet: win.sheetId,
      wins: [win],
    })
  }

  return groups
}

const sectionClass = 'mb-8 rounded-lg border border-slate-200 bg-white p-4 shadow-sm'
const secondaryButtonClass =
  'rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50'
