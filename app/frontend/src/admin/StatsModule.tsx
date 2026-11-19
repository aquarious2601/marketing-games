import { useCallback, useEffect, useState } from 'react'
import { fetchStats, type Stats, type StatsDay } from '../api/stats'
import { useT, type Translate } from '../i18n/I18nContext'
import { Cell, DataTable, Row, type Column } from './DataTable'
import { EMPTY } from './tableFormat'

type LoadPhase = 'loading' | 'ready' | 'failed'

/** F32 R23. A promotion is read by the week. */
const RANGES = [1, 7, 30] as const

type Range = (typeof RANGES)[number]

const DAY_COLUMNS = (t: Translate): Column[] => [
  { key: 'day', label: t('stats.colDay'), width: '14%' },
  { key: 'customers', label: t('stats.colCustomers'), width: '12%', align: 'right' },
  { key: 'new', label: t('stats.colNew'), width: '10%', align: 'right' },
  { key: 'plays', label: t('stats.colPlays'), width: '10%', align: 'right' },
  { key: 'wins', label: t('stats.colWins'), width: '10%', align: 'right' },
  { key: 'collected', label: t('stats.colCollected'), width: '12%', align: 'right' },
  { key: 'rate', label: t('stats.colRate'), width: '10%', align: 'right' },
  { key: 'issuedCost', label: t('stats.colIssuedCost'), width: '11%', align: 'right' },
  { key: 'collectedCost', label: t('stats.colCollectedCost'), width: '11%', align: 'right' },
]

/**
 * The Stats module (F32 R22–R29).
 *
 * Two halves that must never be added together: what the promotion *brings*
 * — customers, new against returning, plays and wins — and what it *costs*,
 * which is only ever what was actually handed over (R15). A prize nobody
 * came back for is a liability, not a spend.
 *
 * There is no revenue figure, deliberately. The only number this
 * application could multiply is the average basket an owner typed, and
 * customers × basket is a made-up figure wearing a currency symbol (F32
 * section 13).
 */
export function StatsModule() {
  const t = useT()
  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [stats, setStats] = useState<Stats | null>(null)
  const [range, setRange] = useState<Range>(7)
  // R19. Null is every game, which is what an owner opens the module for.
  const [game, setGame] = useState<number | null>(null)

  const columns = DAY_COLUMNS(t)

  const load = useCallback(
    async (days: Range, forGame: number | null, signal?: AbortSignal) => {
      setPhase('loading')

      try {
        /*
         * The days are the server's to work out (R18): it holds the store's
         * timezone, and a browser asking for "today" would ask for its own.
         * Only how many of them travels.
         */
        const loaded = await fetchStats(days, forGame, { signal })

        if (signal?.aborted === true) {
          return
        }

        setStats(loaded)
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

  useEffect(() => {
    const controller = new AbortController()

    void load(range, game, controller.signal)

    return () => controller.abort()
  }, [game, load, range])

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {t('stats.title')}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{t('stats.lead')}</p>
      </header>

      <section aria-label={t('stats.title')} className={sectionClass} data-testid="stats-section">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="stats-range" className={labelClass}>
              {t('stats.rangeLabel')}
            </label>
            <select
              id="stats-range"
              value={String(range)}
              onChange={(event) => setRange(Number(event.target.value) as Range)}
              data-testid="stats-range"
              className={`${inputClass} bg-white`}
            >
              <option value="1">{t('stats.rangeToday')}</option>
              <option value="7">{t('stats.rangeWeek')}</option>
              <option value="30">{t('stats.rangeMonth')}</option>
            </select>
          </div>

          {stats !== null && stats.games.length > 1 && (
            <div>
              <label htmlFor="stats-game" className={labelClass}>
                {t('spins.gameLabel')}
              </label>
              <select
                id="stats-game"
                value={game === null ? '' : String(game)}
                onChange={(event) =>
                  setGame(event.target.value === '' ? null : Number(event.target.value))
                }
                data-testid="stats-game"
                className={`${inputClass} bg-white`}
              >
                <option value="">{t('spins.allGames')}</option>
                {stats.games.map((each) => (
                  <option key={each.id} value={each.id}>
                    {each.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {phase === 'loading' && (
          <p role="status" className="mt-4 text-sm text-slate-500">
            {t('stats.loading')}
          </p>
        )}

        {phase === 'failed' && (
          <div role="alert" className="mt-4 flex items-center gap-3">
            <p className="text-sm text-rose-600">{t('stats.loadFailed')}</p>
            <button
              type="button"
              onClick={() => void load(range, game)}
              className={secondaryButtonClass}
            >
              {t('common.tryAgain')}
            </button>
          </div>
        )}

        {phase === 'ready' && stats !== null && <Summary stats={stats} />}
      </section>

      {phase === 'ready' && stats !== null && (
        <section aria-label={t('stats.byDay')} className={sectionClass} data-testid="stats-by-day">
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">
            {t('stats.byDay')}
          </h2>

          <DataTable
            label={t('stats.byDay')}
            columns={columns}
            minWidth="60rem"
            testId="stats-days"
          >
            {stats.days.map((day) => (
              <DayRow key={day.day} day={day} symbol={stats.currencySymbol} />
            ))}
          </DataTable>
        </section>
      )}
    </>
  )
}

/** R24. The stretch at a glance, before the rows. */
function Summary({ stats }: { stats: Stats }) {
  const t = useT()
  const totals = stats.totals
  const unpriced = totals.unpricedIssued + totals.unpricedCollected

  return (
    <>
      <dl
        className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        data-testid="stats-summary"
      >
        <Figure label={t('stats.customers')} value={String(totals.customers)} testId="stat-customers" />
        <Figure
          label={t('stats.newAndReturning')}
          value={t('stats.newAndReturningValue', {
            fresh: totals.newCustomers,
            returning: totals.returningCustomers,
          })}
          testId="stat-new"
        />
        <Figure label={t('stats.plays')} value={String(totals.plays)} testId="stat-plays" />
        <Figure
          label={t('stats.wins')}
          value={t('stats.winsValue', { wins: totals.wins, nothing: totals.wonNothing })}
          testId="stat-wins"
        />
        <Figure
          label={t('stats.collected')}
          value={String(totals.collected)}
          testId="stat-collected"
        />
        {/* R16. "As of now" on screen, because yesterday's rate will be
            higher tomorrow and a figure that quietly changes is a figure
            nobody can trust. */}
        <Figure
          label={t('stats.rate')}
          value={percentage(totals.collectionRate)}
          hint={t('stats.asOfNow')}
          testId="stat-rate"
        />
        <Figure
          label={t('stats.spent')}
          value={money(totals.collectedCost, stats.currencySymbol)}
          hint={t('stats.spentHint')}
          testId="stat-spent"
        />
        <Figure
          label={t('stats.owed')}
          value={t('stats.owedValue', {
            count: totals.outstanding,
            amount: money(totals.issuedCost - totals.collectedCost, stats.currencySymbol),
          })}
          testId="stat-owed"
        />
        <Figure
          label={t('stats.delay')}
          value={delay(totals.medianDelaySeconds, t)}
          testId="stat-delay"
        />
      </dl>

      {/* R20. A total that silently omits rows is worse than no total. */}
      {unpriced > 0 && (
        <p className="mt-4 text-xs text-amber-700" data-testid="stats-unpriced">
          {t('stats.unpriced', { count: unpriced })}
          {stats.averageBasket === null && ` ${t('stats.noBasket')}`}
        </p>
      )}
    </>
  )
}

function DayRow({ day, symbol }: { day: StatsDay; symbol: string }) {
  return (
    <Row testId="stats-day-row" attrs={{ 'data-day': day.day }}>
      <Cell strong testId="stats-day">
        {day.day}
      </Cell>
      <Cell align="right" numeric testId="stats-day-customers">
        {day.customers}
      </Cell>
      <Cell align="right" numeric muted>
        {day.newCustomers}
      </Cell>
      <Cell align="right" numeric testId="stats-day-plays">
        {day.plays}
      </Cell>
      <Cell align="right" numeric>
        {day.wins}
      </Cell>
      <Cell align="right" numeric>
        {day.collected}
      </Cell>
      {/* R21: a dash where there is nothing to divide, never 0%. */}
      <Cell align="right" numeric muted testId="stats-day-rate">
        {percentage(day.collectionRate)}
      </Cell>
      <Cell align="right" numeric muted>
        {money(day.issuedCost, symbol)}
      </Cell>
      <Cell align="right" numeric testId="stats-day-collected-cost">
        {money(day.collectedCost, symbol)}
      </Cell>
    </Row>
  )
}

function Figure({
  label,
  value,
  hint,
  testId,
}: {
  label: string
  value: string
  hint?: string
  testId: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <dt className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums text-slate-900" data-testid={testId}>
        {value}
      </dd>
      {hint !== undefined && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

/** R21. Nothing to divide by reads as nothing. */
function percentage(rate: number | null): string {
  return rate === null ? EMPTY : `${Math.round(rate * 100)}%`
}

/**
 * R26. The store's currency, with its symbol in front.
 *
 * Minor units are not divided here: this application counts whole units of
 * the smallest denomination (F21), and a shop in dong has no subunit to
 * divide into.
 */
function money(amount: number, symbol: string): string {
  return `${symbol}${amount.toLocaleString()}`
}

/** R17. Read as "about this long", which is all a median claims. */
function delay(seconds: number | null, t: Translate): string {
  if (seconds === null) {
    return EMPTY
  }

  const hours = Math.round(seconds / 3600)

  if (hours < 48) {
    return t('stats.delayHours', { count: hours })
  }

  return t('stats.delayDays', { count: Math.round(hours / 24) })
}

const sectionClass = 'mb-8 rounded-lg border border-slate-200 bg-white p-4 shadow-sm'
const labelClass = 'block text-xs font-medium text-slate-600'
const inputClass =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500'
const secondaryButtonClass =
  'rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50'
