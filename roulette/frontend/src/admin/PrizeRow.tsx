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
  /** Whether a losing slice is holding position one (F14 R5). */
  losingFirst: boolean
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
  losingFirst,
  onChange,
  onMove,
  onRemove,
}: PrizeRowProps) {
  const t = useT()
  const nameId = `prize-${prize.key}-name`
  const probabilityId = `prize-${prize.key}-probability`
  const rewardId = `prize-${prize.key}-reward`
  const position = index + 1

  /**
   * F14 R1, section 13: which row is the losing one is read from the reward
   * it points at, never stored on the prize. A flag would be a second fact
   * about the same thing, and it would start disagreeing the moment an admin
   * pointed some other slice at the losing reward from the dropdown.
   */
  const losing = rewards.some((reward) => reward.id === prize.rewardId && reward.type === 'nothing')

  /**
   * F14 R5. The losing slice is pinned to the top, so neither arrow that
   * would unpin it is offered: its own ↓, and the ↑ of the row directly
   * under it. Disabled rather than silently ignored — an arrow that does
   * nothing when pressed is worse than one that is visibly unavailable.
   */
  const canMoveUp = index > 0 && !(losingFirst && index === 1)
  const canMoveDown = index < total - 1 && !losing

  return (
    <li
      className={[
        'rounded-lg p-3',
        losing
          ? // F14 R1: dashed and muted. The one row that gives nothing away
            // should not be the one that looks like all the others.
            'border border-dashed border-slate-300 bg-slate-50'
          : 'border border-slate-200 bg-white shadow-sm',
      ].join(' ')}
      data-testid="prize-row"
      data-losing={losing ? 'true' : undefined}
    >
      {losing && (
        <p
          className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-slate-600"
          data-testid="prize-losing-mark"
        >
          {t('game.losingSlice')}
        </p>
      )}

      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-7 h-4 w-4 shrink-0 rounded-full"
          style={{ backgroundColor: colourFor(index) }}
          data-testid="prize-swatch"
          data-colour={colourFor(index)}
        />

        {/* F14 R7, R8: one flex row holding all three fields, each under a
            label of the same size and position, so the controls share a
            baseline. They stack in this order on a phone. */}
        <div className="min-w-0 flex-1 space-y-3 sm:flex sm:space-y-0 sm:gap-3">
          <div className="min-w-0 flex-1">
            <FieldLabel htmlFor={nameId}>{t('game.prizeName')}</FieldLabel>
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
            <FieldLabel htmlFor={probabilityId}>{t('game.prizePercentage')}</FieldLabel>
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

          <div className="w-full sm:w-48">
            {/* F14 R2, R3. The losing slice's reward is settled by the toggle
                above (F13 R11), so a dropdown here could only be used to
                contradict it. The sentence is there rather than a blank,
                because a missing control reads as something failing to
                render and a sentence reads as a decision. */}
            {losing ? (
              <>
                <FieldLabel>{t('game.reward')}</FieldLabel>
                <p
                  className="flex min-h-[2.375rem] items-center text-sm text-slate-500"
                  data-testid="prize-gives-nothing"
                >
                  {t('game.losingGivesNothing')}
                </p>
              </>
            ) : (
              <>
                {/* F13 R7: what this slice gives away. Beside the label rather
                    than replacing it, because the two are deliberately
                    separate — the catalogue names the reward and the slice
                    names what the player reads (F13 R8). */}
                <FieldLabel htmlFor={rewardId}>{t('game.reward')}</FieldLabel>
                <select
                  id={rewardId}
                  value={prize.rewardId ?? ''}
                  onChange={(event) =>
                    onChange({
                      rewardId: event.target.value === '' ? null : Number(event.target.value),
                    })
                  }
                  aria-invalid={errors.rewardId !== undefined}
                  data-testid="prize-reward"
                  className={[
                    'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900',
                    'focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1',
                  ].join(' ')}
                >
                  <option value="">—</option>
                  {rewards.map((reward) => (
                    <option key={reward.id} value={reward.id}>
                      {reward.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            {errors.rewardId !== undefined && (
              <p role="alert" className="mt-1 text-xs text-rose-600">
                {errors.rewardId}
              </p>
            )}
          </div>
        </div>

        <div className="mt-7 flex shrink-0 items-center gap-1">
          <IconButton
            label={`${t('game.moveUp')}: ${describe(prize.name, position)}`}
            disabled={!canMoveUp}
            onClick={() => onMove(-1)}
          >
            ↑
          </IconButton>
          <IconButton
            label={`${t('game.moveDown')}: ${describe(prize.name, position)}`}
            disabled={!canMoveDown}
            onClick={() => onMove(1)}
          >
            ↓
          </IconButton>
          <IconButton
            label={`${t('game.remove')} ${describe(prize.name, position)}`}
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

/**
 * F14 R7: one label for every field, so the controls below them line up.
 *
 * Without `htmlFor` it is a caption rather than a label — used where the
 * thing below is a sentence and not a control to click into.
 */
function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  const className = 'mb-1 block text-xs font-medium text-slate-600'

  return htmlFor === undefined ? (
    <span className={className}>{children}</span>
  ) : (
    <label htmlFor={htmlFor} className={className}>
      {children}
    </label>
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
