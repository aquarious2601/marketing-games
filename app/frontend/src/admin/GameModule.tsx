import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiValidationError, type ApiViolation } from '../api/client'
import { fetchWheel, saveWheel } from '../games/wheel/api'
import {
  MAX_PRIZES,
  REQUIRED_TOTAL,
  addPrize,
  canAddPrize,
  createPrize,
  canRemovePrize,
  pinLosingFirst,
  fromConfiguration,
  isDirty,
  movePrize,
  removePrize,
  toSubmission,
  updatePrize,
  validate,
  type DraftPrize,
  type PrizeErrors,
} from '../games/wheel/editor'
import { WheelPreview, type PreviewSlice } from '../games/wheel/WheelPreview'
import { fetchRewards, type Reward } from '../api/rewards'
import { useT } from '../i18n/I18nContext'
import { fetchGame, fetchGames, type GameSummary } from '../api/games'
import { GameSettings } from './GameSettings'
import { PrizeRow } from '../games/wheel/PrizeRow'

type LoadState =
  | { phase: 'loading' }
  | { phase: 'ready' }
  | { phase: 'failed'; reason: string }

/**
 * The Game module: what the game *is* (F09 R9).
 *
 * Two sections, both of which configure the game and are usually changed in
 * the same sitting — a new campaign means a new theme and new prizes. They
 * keep their separate saves (F04 R5, F09 R10): folding them into one Save
 * would mean a rejected prize list silently discarded the branding too.
 *
 * Was `AdminPage` until F09, when the admin became three modules and this
 * stopped being the whole of it. It no longer renders the player list, and
 * no longer owns the page frame: AdminLayout supplies the <main> and the tab
 * strip, and this supplies one <h1> and its sections (F09 R8).
 */
export function GameModule() {
  const t = useT()
  /*
   * F27 R38. The game is named by the URL rather than held in state: an
   * admin arrives here from the list, from a bookmark or from a reload, and
   * all three have to open the same game.
   */
  const { id } = useParams<{ id: string }>()
  const gameId = Number(id)
  const [game, setGame] = useState<GameSummary | null>(null)
  const [maxDailyLimit, setMaxDailyLimit] = useState(99)
  const [load, setLoad] = useState<LoadState>({ phase: 'loading' })
  const [drafts, setDrafts] = useState<DraftPrize[]>([])
  const [saved, setSaved] = useState<DraftPrize[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [serverViolations, setServerViolations] = useState<ApiViolation[]>([])
  const [justSaved, setJustSaved] = useState(false)
  // F13 R11, R7.
  const [losing, setLosing] = useState(false)
  const [savedLosing, setSavedLosing] = useState(false)
  const [rewards, setRewards] = useState<Reward[]>([])

  const validation = useMemo(() => validate(drafts), [drafts])
  const dirty = useMemo(
    () => isDirty(drafts, saved) || losing !== savedLosing,
    [drafts, saved, losing, savedLosing],
  )

  const losingReward = useMemo(
    () => rewards.find((reward) => reward.type === 'nothing') ?? null,
    [rewards],
  )

  /**
   * `signal` lets a superseded load be dropped.
   *
   * Without it, two loads overlapping — React's development double-effect, or
   * a retry while the first request is still in flight — both apply, and the
   * later one silently overwrites whatever the admin typed in between.
   */
  const load_ = useCallback(async (signal?: AbortSignal) => {
    setLoad({ phase: 'loading' })

    try {
      // The catalogue comes with the wheel: a slice selector with nothing
      // to select from is not a page worth rendering (F13 R7).
      const [configuration, catalogue, loadedGame, index] = await Promise.all([
        fetchWheel(gameId, { signal }),
        fetchRewards({ signal }),
        fetchGame(gameId, { signal }),
        fetchGames({ signal }),
      ])

      if (signal?.aborted === true) {
        return
      }

      // F14 R5. Normalised before it becomes the baseline as well as the
      // draft, so a wheel saved with its losing slice elsewhere opens in
      // the right order without opening dirty.
      const losingRewardId =
        catalogue.rewards.find((reward) => reward.type === 'nothing')?.id ?? null
      const initial = pinLosingFirst(fromConfiguration(configuration), losingRewardId)

      setGame(loadedGame)
      setMaxDailyLimit(index.maxDailyLimit)
      setDrafts(initial)
      setSaved(initial)
      setLosing(configuration.includesLosingSlice)
      setSavedLosing(configuration.includesLosingSlice)
      setRewards(catalogue.rewards)
      setLoad({ phase: 'ready' })
    } catch {
      if (signal?.aborted === true) {
        return
      }

      // Deliberately no empty form on failure: an admin could otherwise save
      // nothing over a good configuration (F01 section 9, "Load failed").
      setLoad({ phase: 'failed', reason: t('game.loadFailed') })
    }
    // gameId, because opening a different game has to load a different one.
  }, [gameId])

  useEffect(() => {
    const controller = new AbortController()

    void load_(controller.signal)

    return () => controller.abort()
  }, [load_])

  // F01 R21
  useEffect(() => {
    if (!dirty) {
      return
    }

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }

    window.addEventListener('beforeunload', warn)

    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  /**
   * Takes a transform rather than the next array.
   *
   * Reading `drafts` from the render closure drops updates when two changes
   * land before React re-renders — clicking "Add prize" six times quickly
   * would add two or three. Applying the change to the current state instead
   * makes every interaction count.
   */
  const mutate = (transform: (current: DraftPrize[]) => DraftPrize[]) => {
    // F14 R5: re-asserted after every change rather than only where a
    // losing slice is added, so pointing an ordinary slice at the losing
    // reward from its dropdown moves it up too.
    setDrafts((current) => pinLosingFirst(transform(current), losingReward?.id ?? null))
    setJustSaved(false)
    setServerViolations([])
  }

  const onSave = async () => {
    setSaving(true)
    setSaveError(null)
    setServerViolations([])

    try {
      const configuration = await saveWheel(gameId, toSubmission(drafts), losing)
      const stored = fromConfiguration(configuration)

      setDrafts(stored)
      setSaved(stored)
      setLosing(configuration.includesLosingSlice)
      setSavedLosing(configuration.includesLosingSlice)
      setJustSaved(true)
    } catch (error) {
      // The admin's edits stay in the form either way: nothing here replaces
      // `drafts` on failure.
      if (error instanceof ApiValidationError) {
        setServerViolations(error.violations)
        setSaveError(t('game.rejected'))
      } else {
        setSaveError(t('game.saveFailed'))
      }
    } finally {
      setSaving(false)
    }
  }

  const errorsFor = useMemo(
    () => mergeViolations(validation.prizeErrors, serverViolations, drafts.length),
    [validation.prizeErrors, serverViolations, drafts.length],
  )

  const generalViolations = serverViolations.filter((violation) => !violation.field.startsWith('prizes['))

  // F26 R1: a slice's label is its reward's name, resolved from the
  // catalogue this page already holds rather than sent twice (R12).
  const slices: PreviewSlice[] = drafts.map((draft) => ({
    key: draft.key,
    name: rewards.find((reward) => reward.id === draft.rewardId)?.name ?? '',
    probability: /^\d+$/.test(draft.probability) ? Number(draft.probability) : null,
  }))

  if (load.phase === 'loading') {
    return <Centred>
      <p role="status" className="text-sm text-slate-500">{t('common.loading')}</p>
    </Centred>
  }

  if (load.phase === 'failed') {
    return <Centred>
      <div role="alert" className="space-y-3 text-center">
        <p className="text-sm text-rose-600">{load.reason}</p>
        <button type="button" onClick={() => void load_()} className={primaryButtonClass}>
          {t('common.tryAgain')}
        </button>
      </div>
    </Centred>
  }

  return (
    <>
      <header className="mb-6">
        {/* F09 R8: the module's name, once. The prize list and the branding
            are sections within it, each with its own heading. */}
        {/* F09 R8: one h1, and it names what is being edited rather than
            the module — with two games, "Game" says nothing. */}
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {game?.name ?? t('game.title')}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          <Link to="/admin/games" className="underline">
            {t('game.backToGames')}
          </Link>
        </p>
      </header>

      {/* Saved separately from the prizes (F04 R5, F27 R40). */}
      {game !== null && (
        <GameSettings game={game} maxDailyLimit={maxDailyLimit} onSaved={setGame} />
      )}

      {/*
        F26 R19 to R23: one column at every width. The list takes the whole
        page and the preview follows it, so an admin edits a row and then
        looks at the result rather than scrolling past a wheel to reach the
        rows. The preview stops being sticky with the column that held it —
        the trade recorded in F26 section 13.
      */}
      <section aria-label={t('game.prizeList')}>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">
            {t('game.prizes')}
          </h2>

          {/*
            F13 R11–R13. Turning it on adds a slice pointing at the losing
            reward; turning it off takes that slice away. Its probability is
            not redistributed automatically — the admin decides where those
            points go, and the total has to reach 100 before this will save
            (F01 R8), which is the prompt to decide.
          */}
          <label className="mb-3 mt-2 flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={losing}
              disabled={losingReward === null}
              onChange={(event) => {
                const wanted = event.target.checked
                setLosing(wanted)
                setJustSaved(false)

                if (losingReward === null) {
                  return
                }

                setDrafts((current) =>
                  wanted
                    ? // F14 R5: at the top, not appended.
                      [losingSlice(losingReward.id), ...current]
                    : current.filter((draft) => draft.rewardId !== losingReward.id),
                )
              }}
              data-testid="losing-toggle"
              className="mt-0.5 h-4 w-4 rounded border-slate-300"
            />
            <span>
              <span className="font-medium">{t('game.losingToggle')}</span>
              <span className="block text-xs text-slate-500">{t('game.losingToggleHint')}</span>
            </span>
          </label>
          <p className="mb-3 text-sm text-slate-500">
            {t('game.prizesLead')}
          </p>

          <ul className="space-y-2">
            {drafts.map((prize, index) => (
              <PrizeRow
                key={prize.key}
                prize={prize}
                index={index}
                total={drafts.length}
                errors={errorsFor[index] ?? {}}
                canRemove={canRemovePrize(drafts)}
                losingFirst={
                  losingReward !== null && drafts[0]?.rewardId === losingReward.id
                }
                rewards={rewards}
                onChange={(change) => mutate((current) => updatePrize(current, index, change))}
                onMove={(offset) => mutate((current) => movePrize(current, index, offset))}
                onRemove={() => {
                  // F14 R6: the toggle and the list are two views of one
                  // fact. Taking the losing row away with its × is the same
                  // intention as switching the toggle off, so it does both
                  // rather than leaving the toggle claiming a row that is
                  // no longer there.
                  //
                  // Guarded by canRemovePrize for the same reason: a wheel
                  // at its minimum refuses the removal, and the toggle must
                  // not go off over a row that is still on the screen.
                  if (
                    canRemovePrize(drafts) &&
                    losingReward !== null &&
                    prize.rewardId === losingReward.id
                  ) {
                    setLosing(false)
                  }

                  mutate((current) => removePrize(current, index))
                }}
              />
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => mutate(addPrize)}
              disabled={!canAddPrize(drafts)}
              className={secondaryButtonClass}
            >
              {t('game.addPrize')}
            </button>

            <TotalBadge total={validation.total} error={validation.totalError} />
          </div>

          {!canAddPrize(drafts) && (
            <p className="mt-2 text-xs text-slate-500">
              {t('game.atMostPrizes', { max: MAX_PRIZES })}
            </p>
          )}

          {validation.countError !== null && (
            <p role="alert" className="mt-2 text-sm text-rose-600">
              {validation.countError}
            </p>
          )}

          {generalViolations.map((violation) => (
            <p key={violation.field + violation.message} role="alert" className="mt-2 text-sm text-rose-600">
              {violation.message}
            </p>
          ))}

          {saveError !== null && (
            <p role="alert" className="mt-2 text-sm text-rose-600">
              {saveError}
            </p>
          )}

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={!validation.isValid || saving || !dirty}
              data-testid="save-wheel"
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

      {/* F26 R20, R21: after the list and the save controls, centred, and no
          wider than it is on a phone — a 1,600-pixel window has no use for a
          bigger wheel. */}
      <section aria-label={t('game.preview')} className="mt-8">
        <div className="mx-auto max-w-xs">
          <WheelPreview slices={slices} showOdds />
        </div>
      </section>
    </>
  )
}

/**
 * The slice the toggle adds (F13 R12).
 *
 * It arrives with no probability, deliberately: the admin has to say where
 * those points come from, and a slice that silently took them off another
 * would change the odds behind their back. The total then fails F01 R8
 * until they decide, which is the prompt.
 */
function losingSlice(rewardId: number): DraftPrize {
  // F26 R1, R5: no label to give it. It reads the losing reward's name, which
  // is where that wording lives now.
  return { ...createPrize(), rewardId }
}

function TotalBadge({ total, error }: { total: number | null; error: string | null }) {
  const invalid = error !== null || total === null

  return (
    <div
      role="status"
      data-testid="probability-total"
      data-valid={String(!invalid)}
      className={[
        'rounded-full px-3 py-1.5 text-sm font-medium',
        invalid ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700',
      ].join(' ')}
    >
      {total === null ? (
        <>Total: —</>
      ) : (
        <>
          Total: {total}% of {REQUIRED_TOTAL}%
        </>
      )}
    </div>
  )
}

/**
 * The module's own loading and error states.
 *
 * A plain <div>, not a <main>: AdminLayout already supplies the one <main>
 * for the admin (F09 R8), and a nested landmark would make the page have two.
 * Padded rather than full-height for the same reason — the tab strip stays
 * above it, so a module that cannot load is one the admin can leave
 * (F09 section 10).
 */
function Centred({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center py-16">{children}</div>
}

/**
 * Folds server-reported problems into the per-field errors the form already
 * shows, so a rejection from the API lands on the same input the client-side
 * rules would have marked.
 */
function mergeViolations(
  clientErrors: PrizeErrors[],
  violations: ApiViolation[],
  count: number,
): PrizeErrors[] {
  const merged: PrizeErrors[] = Array.from({ length: count }, (_, index) => ({
    ...clientErrors[index],
  }))

  for (const violation of violations) {
    const match = /^prizes\[(\d+)\]\.(name|probability|id)$/.exec(violation.field)

    if (match === null) {
      continue
    }

    const index = Number(match[1])
    const field = match[2]

    if (index >= merged.length) {
      continue
    }

    // An id problem has no input of its own. It used to be shown against the
    // name; with that field gone (F26 R14) the reward selector is the only
    // thing on the row an admin can see and act on, so it goes there.
    const target = field === 'probability' ? 'probability' : 'rewardId'

    merged[index][target] ??= violation.message
  }

  return merged
}

const primaryButtonClass = [
  'rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white',
  'hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40',
].join(' ')

const secondaryButtonClass = [
  'rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700',
  'hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40',
].join(' ')
