import type { Reward } from '../api/rewards'
import { NAME_MAX_LENGTH, type DraftPrize, type PrizeErrors } from '../wheel/editor'
import { useT } from '../i18n/I18nContext'
import { colourFor } from '../wheel/palette'

interface PrizeRowProps {
  prize: DraftPrize
  index: number
  total: number
  errors: PrizeErrors
  canRemove: boolean
  /** The catalogue to pick from (F13 R7). */
  rewards: Reward[]
  onChange: (change: Partial<Pick<DraftPrize, 'name' | 'probability' | 'rewardId'>>) => void
  onMove: (offset: number) => void
  onRemove: () => void
}

export function PrizeRow({
  prize,
  index,
  total,
  errors,
  canRemove,
  rewards,
  onChange,
  onMove,
  onRemove,
}: PrizeRowProps) {
  const t = useT()
  const nameId = `prize-${prize.key}-name`
  const probabilityId = `prize-${prize.key}-probability`
  const rewardId = `prize-${prize.key}-reward`
  const position = index + 1

  return (
    <li
      className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
      data-testid="prize-row"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-2 h-4 w-4 shrink-0 rounded-full"
          style={{ backgroundColor: colourFor(index) }}
          data-testid="prize-swatch"
          data-colour={colourFor(index)}
        />

        <div className="min-w-0 flex-1 space-y-3 sm:flex sm:space-y-0 sm:gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor={nameId} className="sr-only">
              Prize {position} name
            </label>
            <input
              id={nameId}
              type="text"
              value={prize.name}
              maxLength={NAME_MAX_LENGTH}
              placeholder={t('game.prizeName')}
              aria-invalid={errors.name !== undefined}
              aria-describedby={errors.name !== undefined ? `${nameId}-error` : undefined}
              onChange={(event) => onChange({ name: event.target.value })}
              className={fieldClass(errors.name !== undefined)}
            />
            {errors.name !== undefined && (
              <p id={`${nameId}-error`} role="alert" className="mt-1 text-xs text-rose-600">
                {errors.name}
              </p>
            )}
          </div>

          <div className="w-full sm:w-28">
            <label htmlFor={probabilityId} className="sr-only">
              Prize {position} winning percentage
            </label>
            <div className="relative">
              <input
                id={probabilityId}
                // "text" with a numeric input mode, not "number": a number
                // input silently accepts "2e3" and lets a scroll wheel change
                // the odds by accident.
                type="text"
                inputMode="numeric"
                value={prize.probability}
                placeholder="0"
                aria-invalid={errors.probability !== undefined}
                aria-describedby={
                  errors.probability !== undefined ? `${probabilityId}-error` : undefined
                }
                onChange={(event) => onChange({ probability: event.target.value })}
                className={`${fieldClass(errors.probability !== undefined)} pr-7`}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400"
              >
                %
              </span>
            </div>
            {errors.probability !== undefined && (
              <p id={`${probabilityId}-error`} role="alert" className="mt-1 text-xs text-rose-600">
                {errors.probability}
              </p>
            )}
          </div>
        </div>

        {/* F13 R7: what this slice gives away. Beside the label rather than
            replacing it, because the two are deliberately separate — the
            catalogue names the reward and the slice names what the player
            reads (F13 R8). */}
        <div className="mt-2">
          <label htmlFor={rewardId} className="block text-xs font-medium text-slate-600">
            {t('game.reward')}
          </label>
          <select
            id={rewardId}
            value={prize.rewardId ?? ''}
            onChange={(event) =>
              onChange({ rewardId: event.target.value === '' ? null : Number(event.target.value) })
            }
            aria-invalid={errors.rewardId !== undefined}
            data-testid="prize-reward"
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="">—</option>
            {rewards.map((reward) => (
              <option key={reward.id} value={reward.id}>
                {reward.name}
              </option>
            ))}
          </select>
          {errors.rewardId !== undefined && (
            <p role="alert" className="mt-1 text-xs text-rose-600">
              {errors.rewardId}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            label={`${t('game.moveUp')}: ${describe(prize.name, position)}`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            ↑
          </IconButton>
          <IconButton
            label={`${t('game.moveDown')}: ${describe(prize.name, position)}`}
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            ↓
          </IconButton>
          <IconButton
            label={`Remove ${describe(prize.name, position)}`}
            disabled={!canRemove}
            danger
            onClick={onRemove}
          >
            ×
          </IconButton>
        </div>
      </div>
    </li>
  )
}

/** Names the row for screen readers, falling back to its position. */
function describe(name: string, position: number): string {
  const trimmed = name.trim()

  return trimmed === '' ? `prize ${position}` : trimmed
}

function fieldClass(invalid: boolean): string {
  return [
    'w-full rounded-md border px-3 py-2 text-sm text-slate-900',
    'focus:outline-none focus:ring-2 focus:ring-offset-1',
    invalid
      ? 'border-rose-400 focus:ring-rose-400'
      : 'border-slate-300 focus:ring-sky-500',
  ].join(' ')
}

function IconButton({
  label,
  disabled,
  danger = false,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  danger?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={[
        'flex h-8 w-8 items-center justify-center rounded-md border text-base leading-none',
        'disabled:cursor-not-allowed disabled:opacity-30',
        danger
          ? 'border-rose-200 text-rose-600 enabled:hover:bg-rose-50'
          : 'border-slate-200 text-slate-600 enabled:hover:bg-slate-50',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
