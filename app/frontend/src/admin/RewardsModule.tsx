import { useCallback, useEffect, useState } from 'react'
import { fetchStore, type CurrencyOption } from '../api/branding'
import { ApiValidationError, type ApiViolation } from '../api/client'
import {
  createReward,
  deleteReward,
  fetchRewards,
  formatValue,
  takesCurrency,
  takesValue,
  updateReward,
  type Reward,
  type RewardDraft,
  type RewardType,
  type RewardTypeOption,
} from '../api/rewards'
import { useT, type Translate } from '../i18n/I18nContext'
import { symbolFor } from './CurrencySelect'
import { Cell, DataTable, Row, type Column } from './DataTable'
import { formatDate } from './tableFormat'

type LoadPhase = 'loading' | 'ready' | 'failed'

/** F11 R2, R3, R5. */
const REWARD_COLUMNS = (t: Translate): Column[] => [
  { key: 'name', label: t('rewards.colName'), width: '30%' },
  { key: 'type', label: t('rewards.colType'), width: '22%' },
  { key: 'value', label: t('rewards.colValue'), width: '14%', align: 'right' },
  { key: 'usedBy', label: t('rewards.colUsedBy'), width: '20%' },
  { key: 'added', label: t('rewards.colAdded'), width: '14%' },
]

const BLANK: RewardDraft = { name: '', type: 'free_product' }

/**
 * The Rewards module: what the wheel can give away (F13 R1–R6).
 *
 * Configuration only, by F13's own decision. What has actually been *won* —
 * the code and whether it was handed over — lives in the Spins module,
 * because that is a record of events and this is a list of definitions.
 *
 * The editor is a row that opens in place rather than a dialog, matching how
 * a player's history opens in the Players module (F11 R11): the admin keeps
 * the list they were reading, and nothing covers it.
 */
export function RewardsModule() {
  const t = useT()

  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [rewards, setRewards] = useState<Reward[]>([])
  const [types, setTypes] = useState<RewardTypeOption[]>([])
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([])
  // F15 R8: the effective currency — the admin's choice, or what their
  // language suggests while there is none. The editor opens on it.
  const [currency, setCurrency] = useState('')
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const columns = REWARD_COLUMNS(t)

  const load = useCallback(async (signal?: AbortSignal) => {
    setPhase('loading')

    try {
      // The catalogue and the currency together: a value column that cannot
      // say what the number means is not worth rendering (F13 R28).
      const [catalogue, branding] = await Promise.all([
        fetchRewards({ signal }),
        fetchStore({ signal }),
      ])

      if (signal?.aborted === true) {
        return
      }

      setRewards(catalogue.rewards)
      setTypes(catalogue.types)
      setCurrencies(branding.currencies)
      setCurrency(branding.currency)
      setPhase('ready')
    } catch {
      if (signal?.aborted === true) {
        return
      }

      setPhase('failed')
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    void load(controller.signal)

    return () => controller.abort()
  }, [load])

  const onRemove = async (reward: Reward) => {
    setError(null)

    try {
      await deleteReward(reward.id)
      await load()
    } catch (caught) {
      // The server names the slices in the way (F13 R6); its message is
      // more useful than anything this page could compose.
      setError(
        caught instanceof ApiValidationError && caught.violations[0] !== undefined
          ? caught.violations[0].message
          : t('rewards.deleteFailed'),
      )
    }
  }

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {t('rewards.title')}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{t('rewards.lead')}</p>
      </header>

      <section aria-label={t('rewards.title')} className={sectionClass} data-testid="rewards-section">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">
            {t('rewards.list')}
          </h2>
          <span className="text-xs text-slate-500" data-testid="rewards-total">
            {rewards.length === 1
              ? t('rewards.countOne')
              : t('rewards.count', { count: rewards.length })}
          </span>
        </div>

        {phase === 'loading' && (
          <p role="status" className="mt-4 text-sm text-slate-500">
            {t('rewards.loading')}
          </p>
        )}

        {phase === 'failed' && (
          <div role="alert" className="mt-4 flex items-center gap-3">
            <p className="text-sm text-rose-600">{t('rewards.loadFailed')}</p>
            <button type="button" onClick={() => void load()} className={secondaryButtonClass}>
              {t('common.tryAgain')}
            </button>
          </div>
        )}

        {error !== null && (
          <p role="alert" className="mt-4 text-sm text-rose-600" data-testid="rewards-error">
            {error}
          </p>
        )}

        {phase === 'ready' && rewards.length === 0 && editing === null && (
          <p className="mt-4 text-sm text-slate-500" data-testid="rewards-empty">
            {t('rewards.none')}
          </p>
        )}

        {phase === 'ready' && rewards.length > 0 && (
          <DataTable
            label={t('rewards.list')}
            columns={columns}
            minWidth="42rem"
            testId="reward-list"
          >
            {rewards.map((reward) => (
              <Row key={reward.id} testId="reward-row">
                <Cell strong>
                  <button
                    type="button"
                    onClick={() => setEditing(editing === reward.id ? null : reward.id)}
                    aria-expanded={editing === reward.id}
                    data-testid="reward-open"
                    className="w-full truncate text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  >
                    {reward.name}
                  </button>
                </Cell>
                <Cell testId="reward-type">{t(`rewardType.${reward.type}`)}</Cell>
                <Cell align="right" numeric testId="reward-value">
                  {formatValue(reward, symbolFor(currencies, currency))}
                </Cell>
                {/* F13 R6: what is in the way, before delete is pressed. */}
                <Cell muted testId="reward-used-by">
                  {/* F26 R24: positions, since a slice's label is this
                      reward's own name and listing it back would say
                      nothing. */}
                  {reward.usedBy.length === 0
                    ? t('rewards.unused')
                    : reward.usedBy.map((position) => `#${position}`).join(', ')}
                </Cell>
                <Cell numeric muted>
                  {formatDate(reward.createdAt)}
                </Cell>
              </Row>
            ))}
          </DataTable>
        )}

        {phase === 'ready' && editing !== null && (
          <RewardEditor
            types={types}
            currencies={currencies}
            currency={currency}
            reward={editing === 'new' ? null : (rewards.find((r) => r.id === editing) ?? null)}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null)
              void load()
            }}
            onDelete={(reward) => {
              setEditing(null)
              void onRemove(reward)
            }}
          />
        )}

        {phase === 'ready' && editing === null && (
          <button
            type="button"
            onClick={() => setEditing('new')}
            data-testid="reward-add"
            className={`mt-4 ${primaryButtonClass}`}
          >
            {t('rewards.add')}
          </button>
        )}
      </section>
    </>
  )
}

interface EditorProps {
  reward: Reward | null
  types: RewardTypeOption[]
  /** F15 R14: the list and the symbols, as the server sent them. */
  currencies: CurrencyOption[]
  /** F15 R8: what the picker opens on. */
  currency: string
  onCancel: () => void
  onSaved: () => void
  onDelete: (reward: Reward) => void
}

/**
 * Adding or changing one reward.
 *
 * The value field appears only for the two types that take one (F13 R3),
 * and an amount is accompanied by the currency it is counted in (F15 R7),
 * so the admin is never typing a number with no stated unit.
 */
function RewardEditor({
  reward,
  types,
  currencies,
  currency,
  onCancel,
  onSaved,
  onDelete,
}: EditorProps) {
  const t = useT()

  const [draft, setDraft] = useState<RewardDraft>(() =>
    reward === null
      ? BLANK
      : {
          name: reward.name,
          type: reward.type,
          ...(reward.value !== null ? { value: reward.value } : {}),
          // F32 R7: null is unpriced, and stays null rather than becoming a
          // zero the admin never typed.
          cost: reward.cost,
        },
  )
  const [saving, setSaving] = useState(false)
  const [violations, setViolations] = useState<ApiViolation[]>([])
  const [failure, setFailure] = useState<string | null>(null)

  const problem = (field: string) => violations.find((v) => v.field === field)?.message

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (saving) {
      return
    }

    setSaving(true)
    setViolations([])
    setFailure(null)

    // F13 R3: a value is sent only for the types that take one, because
    // sending one otherwise is rejected rather than ignored.
    const payload: RewardDraft = takesValue(draft.type)
      ? { name: draft.name, type: draft.type, value: draft.value ?? 0 }
      : { name: draft.name, type: draft.type }

    /*
     * F32 R1, R4. Sent for every type except the losing one, which the
     * server refuses a cost on rather than ignoring — nothing is handed
     * over, so nothing is spent.
     */
    if (draft.type !== 'nothing') {
      payload.cost = draft.cost ?? null
    }

    /*
     * F27 R16. No currency goes up any more. F15 R9 had an amount-off save
     * set the campaign's currency, which was a reasonable way to answer
     * "nobody has chosen yet" while the currency was the campaign's — and is
     * the wrong place to answer it now that one shop's choice re-labels every
     * game. The Store module is where it is chosen.
     */

    try {
      if (reward === null) {
        await createReward(payload)
      } else {
        await updateReward(reward.id, payload)
      }

      onSaved()
    } catch (caught) {
      // What was typed stays in the form either way.
      if (caught instanceof ApiValidationError) {
        setViolations(caught.violations)
      } else {
        setFailure(t('rewards.saveFailed'))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      data-testid="reward-editor"
      className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4"
      noValidate
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="reward-name" className={labelClass}>
            {t('rewards.name')}
          </label>
          <input
            id="reward-name"
            type="text"
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            aria-invalid={problem('name') !== undefined}
            data-testid="reward-name"
            className={inputClass}
          />
          {problem('name') !== undefined && (
            <p role="alert" className="mt-1 text-xs text-rose-600">
              {problem('name')}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="reward-type" className={labelClass}>
            {t('rewards.type')}
          </label>
          <select
            id="reward-type"
            value={draft.type}
            onChange={(event) =>
              setDraft((current) => ({ ...current, type: event.target.value as RewardType }))
            }
            data-testid="reward-type-select"
            className={`${inputClass} bg-white`}
          >
            {types.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {takesValue(draft.type) && (
          <div>
            <label htmlFor="reward-value" className={labelClass}>
              {t('rewards.value')}
              {draft.type === 'percent_off'
                ? ' (%)'
                : ` (${symbolFor(currencies, currency)})`}
            </label>
            {/* F15 section 9: the amount and what it is counted in are one
                answer, so they are one line. The suffix above follows the
                select, so the unit is stated twice and never disagrees. */}
            <div className="flex items-start gap-2">
              <input
                id="reward-value"
                type="number"
                inputMode="numeric"
                value={draft.value ?? ''}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    value: event.target.value === '' ? undefined : Number(event.target.value),
                  }))
                }
                aria-invalid={problem('value') !== undefined}
                data-testid="reward-value-input"
                className={`${inputClass} min-w-0 flex-1`}
              />
              {/*
                F27 R16. The shop's currency, said rather than offered. A
                picker here would re-label every reward of every game from
                inside a form about one reward — which is what it used to do
                (F15 R9), and what stopped making sense when the currency
                became the store's.
              */}
              {takesCurrency(draft.type) && (
                <span
                  data-testid="reward-currency"
                  className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                >
                  {symbolFor(currencies, currency)} {currency}
                </span>
              )}
            </div>
            {problem('value') !== undefined && (
              <p role="alert" className="mt-1 text-xs text-rose-600">
                {problem('value')}
              </p>
            )}
            {problem('currency') !== undefined && (
              <p role="alert" className="mt-1 text-xs text-rose-600">
                {problem('currency')}
              </p>
            )}
            {takesCurrency(draft.type) && (
              <p className="mt-1 text-xs text-slate-500">{t('rewards.currencyHint')}</p>
            )}
          </div>
        )}

        {/* F32 R1. What the shop spends, which is a different fact from
            what the customer saves above — and the only one the stats can
            add up. Offered for every type but the losing one (R4). */}
        {draft.type !== 'nothing' && (
          <div>
            <label htmlFor="reward-cost" className={labelClass}>
              {t('rewards.cost')} ({symbolFor(currencies, currency)})
            </label>
            <input
              id="reward-cost"
              type="number"
              inputMode="numeric"
              min={0}
              value={draft.cost ?? ''}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  // R7: emptied is unpriced, not zero.
                  cost: event.target.value === '' ? null : Number(event.target.value),
                }))
              }
              aria-invalid={problem('cost') !== undefined}
              data-testid="reward-cost-input"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-slate-500">
              {draft.type === 'percent_off' ? t('rewards.costHintPercent') : t('rewards.costHint')}
            </p>
            {problem('cost') !== undefined && (
              <p role="alert" className="mt-1 text-xs text-rose-600">
                {problem('cost')}
              </p>
            )}
          </div>
        )}
      </div>

      {failure !== null && (
        <p role="alert" className="mt-3 text-sm text-rose-600">
          {failure}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} data-testid="reward-save" className={primaryButtonClass}>
          {saving ? t('common.saving') : t('common.save')}
        </button>
        <button type="button" onClick={onCancel} className={secondaryButtonClass}>
          {t('rewards.cancel')}
        </button>

        {reward !== null && (
          <button
            type="button"
            onClick={() => onDelete(reward)}
            data-testid="reward-delete"
            className="ml-auto rounded-md border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
          >
            {t('rewards.delete')}
          </button>
        )}
      </div>
    </form>
  )
}

const sectionClass = 'mb-8 rounded-lg border border-slate-200 bg-white p-4 shadow-sm'
const labelClass = 'block text-xs font-medium text-slate-600'
const inputClass =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500'
const primaryButtonClass =
  'rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40'
const secondaryButtonClass =
  'rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50'
