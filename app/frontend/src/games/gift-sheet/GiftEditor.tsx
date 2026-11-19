import { useCallback, useEffect, useState } from 'react'
import { ApiValidationError, type ApiViolation } from '../../api/client'
import { fetchRewards, type Reward } from '../../api/rewards'
import { useT } from '../../i18n/I18nContext'
import { fetchSheetGifts, saveSheetGifts, type GiftRow } from './api'

type LoadPhase = 'loading' | 'ready' | 'failed'

/**
 * What a gift sheet gives away (F28 R21–R24).
 *
 * The wheel's prize editor with the odds taken out, which is the whole of
 * the difference: no probability column, no running total, no colour. What
 * is left is a list of rewards in an order, so this is a list of rewards in
 * an order.
 */
export function GiftEditor({ gameId }: { gameId: number }) {
  const t = useT()
  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [gifts, setGifts] = useState<GiftRow[]>([])
  const [saved, setSaved] = useState<GiftRow[]>([])
  const [rewards, setRewards] = useState<Reward[]>([])
  const [maxGifts, setMaxGifts] = useState(6)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [violations, setViolations] = useState<ApiViolation[]>([])

  const load = useCallback(async (signal?: AbortSignal) => {
    setPhase('loading')

    try {
      const [sheet, catalogue] = await Promise.all([
        fetchSheetGifts(gameId, { signal }),
        fetchRewards({ signal }),
      ])

      if (signal?.aborted === true) {
        return
      }

      setGifts(sheet.gifts)
      setSaved(sheet.gifts)
      setMaxGifts(sheet.maxGifts)
      setRewards(catalogue.rewards)
      setPhase('ready')
    } catch {
      if (signal?.aborted !== true) {
        setPhase('failed')
      }
    }
  }, [gameId])

  useEffect(() => {
    const controller = new AbortController()

    void load(controller.signal)

    return () => controller.abort()
  }, [load])

  /**
   * F28 R5: the losing reward is not offered at all. A sheet gives
   * everything on it, so "you have not won" on one is a contradiction — and
   * offering it only to refuse the save would be a worse way to say so.
   */
  const offerable = rewards.filter((reward) => reward.type !== 'nothing')

  /** F28 R2, R24: a reward already on the sheet is not offered again. */
  const available = (position: number) =>
    offerable.filter(
      (reward) =>
        reward.id === gifts[position]?.rewardId ||
        !gifts.some((gift) => gift.rewardId === reward.id),
    )

  const dirty =
    gifts.length !== saved.length ||
    gifts.some((gift, index) => gift.rewardId !== saved[index]?.rewardId)

  const change = (next: GiftRow[]) => {
    setGifts(next)
    setJustSaved(false)
    setViolations([])
    setError(null)
  }

  const onAdd = () => {
    const spare = available(-1)[0]

    if (spare === undefined) {
      return
    }

    change([
      ...gifts,
      { id: null, rewardId: spare.id, name: spare.name, position: gifts.length },
    ])
  }

  const onPick = (position: number, rewardId: number) => {
    const reward = rewards.find((each) => each.id === rewardId)

    change(
      gifts.map((gift, index) =>
        index === position
          ? { ...gift, rewardId, name: reward?.name ?? gift.name }
          : gift,
      ),
    )
  }

  const onRemove = (position: number) =>
    change(gifts.filter((_, index) => index !== position))

  const onMove = (position: number, offset: number) => {
    const target = position + offset

    if (target < 0 || target >= gifts.length) {
      return
    }

    const next = [...gifts]
    const [moved] = next.splice(position, 1)
    next.splice(target, 0, moved)

    change(next)
  }

  const onSave = async () => {
    setSaving(true)
    setError(null)
    setViolations([])

    try {
      const result = await saveSheetGifts(
        gameId,
        gifts.map((gift) => ({ rewardId: gift.rewardId })),
      )

      setGifts(result.gifts)
      setSaved(result.gifts)
      setJustSaved(true)
    } catch (caught) {
      if (caught instanceof ApiValidationError) {
        setViolations(caught.violations)
      }

      setError(t('sheet.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const violationFor = (field: string) =>
    violations.find((violation) => violation.field === field)?.message

  if (phase === 'loading') {
    return (
      <section aria-label={t('sheet.gifts')} className={sectionClass}>
        <p role="status" className="text-sm text-slate-500">
          {t('sheet.loading')}
        </p>
      </section>
    )
  }

  if (phase === 'failed') {
    return (
      <section aria-label={t('sheet.gifts')} className={sectionClass}>
        <div role="alert" className="flex items-center gap-3">
          <p className="text-sm text-rose-600">{t('sheet.loadFailed')}</p>
          <button type="button" onClick={() => void load()} className={secondaryButtonClass}>
            {t('common.tryAgain')}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section aria-label={t('sheet.gifts')} className={sectionClass} data-testid="gift-editor">
      <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">
        {t('sheet.gifts')}
      </h2>
      {/* F28 R10, said once where an admin configures it: this is not a draw. */}
      <p className="mt-1 text-xs text-slate-500">{t('sheet.giftsLead')}</p>

      {offerable.length === 0 && (
        <p className="mt-4 text-sm text-amber-800" data-testid="gift-no-rewards">
          {t('sheet.noRewards')}
        </p>
      )}

      {gifts.length === 0 && offerable.length > 0 && (
        <p className="mt-4 text-sm text-slate-500" data-testid="gift-empty">
          {t('sheet.empty')}
        </p>
      )}

      <ul className="mt-4 space-y-2">
        {gifts.map((gift, position) => (
          <li
            key={gift.id ?? `new-${position}`}
            data-testid="gift-row"
            className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 p-2"
          >
            <span className="w-6 text-xs text-slate-400">{position + 1}</span>

            <label className="sr-only" htmlFor={`gift-${position}`}>
              {t('sheet.gift')}
            </label>
            <select
              id={`gift-${position}`}
              value={gift.rewardId}
              onChange={(event) => onPick(position, Number(event.target.value))}
              data-testid="gift-reward"
              className={`${inputClass} min-w-0 flex-1`}
            >
              {available(position).map((reward) => (
                <option key={reward.id} value={reward.id}>
                  {reward.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => onMove(position, -1)}
              disabled={position === 0}
              aria-label={t('game.moveUp')}
              className={iconButtonClass}
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => onMove(position, 1)}
              disabled={position === gifts.length - 1}
              aria-label={t('game.moveDown')}
              className={iconButtonClass}
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => onRemove(position)}
              aria-label={t('game.remove')}
              data-testid="gift-remove"
              className={iconButtonClass}
            >
              ×
            </button>

            {violationFor(`gifts[${position}]`) !== undefined && (
              <p role="alert" className="w-full text-xs text-rose-600">
                {violationFor(`gifts[${position}]`)}
              </p>
            )}
          </li>
        ))}
      </ul>

      {/* F28 R3: the cap comes from what fits a phone, so the control says so
          rather than silently refusing a seventh. */}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onAdd}
          disabled={gifts.length >= maxGifts || available(-1).length === 0}
          data-testid="gift-add"
          className={secondaryButtonClass}
        >
          {t('sheet.add')}
        </button>
        {gifts.length >= maxGifts && (
          <span className="text-xs text-slate-500">{t('sheet.atMost', { max: maxGifts })}</span>
        )}
      </div>

      {violationFor('gifts') !== undefined && (
        <p role="alert" className="mt-3 text-sm text-rose-600">
          {violationFor('gifts')}
        </p>
      )}

      {error !== null && (
        <p role="alert" className="mt-3 text-sm text-rose-600">
          {error}
        </p>
      )}

      {/* F28 R23: what the player will read, in the order they will read it. */}
      {gifts.length > 0 && (
        <div className="mt-6 rounded-md bg-slate-50 p-3" data-testid="gift-preview">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            {t('sheet.preview')}
          </p>
          <ul className="mt-2 space-y-1">
            {gifts.map((gift, position) => (
              <li key={gift.id ?? `preview-${position}`} className="text-sm text-slate-800">
                {gift.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving || !dirty}
          data-testid="save-sheet"
          className={primaryButtonClass}
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>

        {justSaved && !dirty && (
          <span role="status" className="text-sm text-emerald-700">
            {t('common.saved')}
          </span>
        )}
        {dirty && !saving && (
          <span className="text-sm text-slate-400">{t('common.unsavedChanges')}</span>
        )}
      </div>
    </section>
  )
}

const sectionClass = 'mb-8 rounded-lg border border-slate-200 bg-white p-4 shadow-sm'
const inputClass =
  'rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500'
const primaryButtonClass =
  'rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40'
const secondaryButtonClass =
  'rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'
const iconButtonClass =
  'rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30'
