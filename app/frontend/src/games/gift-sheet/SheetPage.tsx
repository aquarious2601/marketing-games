import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import { fetchIdentity, forgetPlayer, type PlayerIdentity } from '../../api/player'
import { ThemeScene } from '../../branding/ThemeScene'
import { useT } from '../../i18n/I18nContext'
import { LanguagePicker } from '../../i18n/LanguagePicker'
import { CELEBRATION_MS, Confetti } from '../../player/Confetti'
import { IdentityStep } from '../../player/IdentityStep'
import { PlayerHeader } from '../../player/PlayerHeader'
import { Barcode } from '../../reward/Barcode'
import { fetchSheet, issueSheet, type IssuedSheet, type Sheet } from './api'

type Phase = 'loading' | 'ready' | 'failed' | 'spent'

/**
 * Playing a gift sheet (F28 §9).
 *
 * Three screens and the first is the wheel's own: identify, then one
 * control, then the sheet. No animation, because there is nothing to reveal
 * — the player already knows they are getting everything on the list (R10),
 * and six seconds of suspense over a foregone conclusion is a lie about the
 * game.
 */
export function SheetPage() {
  const t = useT()
  const [phase, setPhase] = useState<Phase>('loading')
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [player, setPlayer] = useState<PlayerIdentity | null>(null)
  const [issued, setIssued] = useState<IssuedSheet | null>(null)
  const [giving, setGiving] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  /*
   * F33 R16. Which gift is open as a barcode, by its position on the sheet.
   * Nothing is fetched or re-issued to open one (R19) — the codes were
   * minted once, by the request that gave them out (F28 R9), and this is
   * only which of them is being shown big enough to scan.
   */
  const [opened, setOpened] = useState<number | null>(null)
  const celebrationTimer = useRef<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setPhase('loading')

    const [loaded, identity] = await Promise.all([
      fetchSheet({ signal }).then(
        (value) => ({ ok: true as const, value }),
        () => ({ ok: false as const, value: null }),
      ),
      fetchIdentity({ signal }).then(
        (value) => value,
        () => ({ player: null, spin: null, spinsLeft: null }),
      ),
    ])

    if (signal?.aborted === true) {
      return
    }

    setPlayer(identity.player)

    if (!loaded.ok) {
      setPhase('failed')

      return
    }

    setSheet(loaded.value)
    // F28 R18: the same session's own sheet comes back on a reload.
    setIssued(loaded.value.issued)
    setPhase('ready')
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    void load(controller.signal)

    return () => controller.abort()
  }, [load])

  /**
   * F28 R14, F10 R3. The stall phone moves to the person behind them, and
   * the next player inherits nothing: not the identity, and not the sheet.
   */
  const onNextPlayer = async () => {
    setPlayer(null)
    setIssued(null)
    setError(null)
    setPhase('ready')

    try {
      await forgetPlayer()
    } catch {
      // Nothing to tell them: they have already stopped being that player
      // as far as this page is concerned.
    }
  }

  /**
   * F28 R15, F22 R1. Once for the sheet, not once per gift: six bursts of
   * confetti is not six times the celebration.
   *
   * No reduced-motion check, exactly as F22 R11 does not make one — the
   * honest answer to that is a visible control, which is on the roadmap.
   */
  const celebrate = useCallback(() => {
    setCelebrating(true)
    celebrationTimer.current = window.setTimeout(() => {
      celebrationTimer.current = null
      setCelebrating(false)
    }, CELEBRATION_MS)
  }, [])

  // A player who hands the phone over mid-celebration unmounts this.
  useEffect(
    () => () => {
      if (celebrationTimer.current !== null) {
        window.clearTimeout(celebrationTimer.current)
      }
    },
    [],
  )

  const onGet = async () => {
    setGiving(true)
    setError(null)

    try {
      setIssued(await issueSheet())
      celebrate()
    } catch (caught) {
      /*
       * F28 R20. A 429 is not a failure to report: this person has had
       * their sheet today, and the screen for that says come back tomorrow
       * with no codes on it (R18).
       */
      if (caught instanceof ApiError && 429 === caught.status) {
        setPhase('spent')
      } else {
        setError(t('sheet.failed'))
      }
    } finally {
      setGiving(false)
    }
  }

  if (phase === 'loading' || sheet === null) {
    return (
      <Screen theme={sheet?.branding.theme ?? 'plain'}>
        <p role="status" className="text-sm" style={{ color: 'var(--body)' }}>
          {t('common.loading')}
        </p>
      </Screen>
    )
  }

  if (phase === 'failed') {
    return (
      <Screen theme={sheet.branding.theme}>
        <div role="alert" className="space-y-4 text-center">
          <p className="text-sm" style={{ color: 'var(--danger)' }}>
            {t('player.loadFailed')}
          </p>
          <button type="button" onClick={() => void load()} className={buttonClass}>
            {t('common.tryAgain')}
          </button>
        </div>
      </Screen>
    )
  }

  /**
   * F28 R18, which is F23 R14–R17 unchanged: they have played today, and the
   * screen says so and nothing else. No codes — anybody may type anybody's
   * number into a stall phone.
   */
  if (phase === 'spent') {
    return (
      <Screen theme={sheet.branding.theme}>
        <PlayerHeader branding={sheet.branding} />
        <div className="mt-6 text-center" data-testid="sheet-spent">
          <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--body)' }}>
            {t('player.alreadyPlayedKicker')}
          </p>
          <p role="status" className="mt-1 text-base" style={{ color: 'var(--heading)' }}>
            {t('player.alreadyPlayedToday')}
          </p>
          {/* F23 R14's words, because it is F23's rule: come back tomorrow,
              and nothing about what they were given. */}
          <p className="mt-1 text-sm" style={{ color: 'var(--body)' }}>
            {t('player.comeBackTomorrow')}
          </p>

          {/* F23 R16: so the stall can move on to the person behind them. */}
          <button
            type="button"
            onClick={() => void onNextPlayer()}
            data-testid="next-player"
            className={`${buttonClass} mt-6`}
          >
            {t('player.nextCustomer')}
          </button>
        </div>
      </Screen>
    )
  }

  if (player === null) {
    return (
      <Screen theme={sheet.branding.theme}>
        <PlayerHeader branding={sheet.branding} />
        {/* F28 R8: the wheel's form, unchanged — the same fields, the same
            validation, the same returning-player lookup. */}
        <IdentityStep onIdentified={() => void load()} />
      </Screen>
    )
  }

  if (issued !== null) {
    const open = opened === null ? null : (issued.gifts[opened] ?? null)

    /*
     * F33 R16 to R18: one gift, the full width of the panel. Six barcodes do
     * not fit a phone and six shrunk to fit are six that will not scan
     * (R17), and the counter claims them one at a time anyway (F28 §3).
     *
     * The hand-over button is deliberately not on this screen. It is how the
     * sheet is wiped for the next customer (F28 R14), and a screen whose
     * whole job is to be held out across a counter is the worst place to put
     * it: the way back is the way back to it.
     */
    if (open !== null && open.code !== null) {
      return (
        <Screen theme={sheet.branding.theme}>
          <PlayerHeader branding={sheet.branding} />

          <h2
            className="mt-6 text-center text-lg font-semibold"
            style={{ color: 'var(--heading)' }}
            data-testid="opened-gift"
          >
            {open.name}
          </h2>

          <div className="mt-4 w-full">
            <Barcode code={open.code} className="h-16" />
          </div>

          <p
            data-testid="opened-code"
            className="mt-2 text-center font-mono text-lg font-bold tracking-[0.12em]"
            style={{ color: 'var(--heading)' }}
          >
            {open.code}
          </p>

          <p className="mt-2 text-center text-xs" style={{ color: 'var(--body)' }}>
            {t('sheet.showAtCounter')}
          </p>

          <button
            type="button"
            onClick={() => setOpened(null)}
            data-testid="close-gift"
            className={`${buttonClass} mt-6`}
          >
            {t('sheet.allGifts')}
          </button>
        </Screen>
      )
    }

    return (
      <Screen theme={sheet.branding.theme}>
        <PlayerHeader branding={sheet.branding} />

        <h2 className="mt-6 text-center text-lg font-semibold" style={{ color: 'var(--heading)' }}>
          {t('sheet.yours')}
        </h2>

        {/* F28 R13, R3: every gift with its code, and short enough that six
            of them fit a phone without scrolling. F33 R15 leaves the list
            exactly that — the barcode is a press away, not on it. */}
        <ul className="mt-4 w-full space-y-2" data-testid="issued-sheet">
          {issued.gifts.map((gift, index) => (
            <li
              key={`${gift.name}-${index}`}
              data-testid="issued-gift"
              className="border-b pb-1"
              style={{ borderColor: 'var(--rim)' }}
            >
              {/*
                F33 R16. The whole row is the control, so a thumb aiming at
                either the name or the code opens the same gift. A gift
                without a code cannot be opened, because there is nothing to
                encode — F28 R10 gives every gift one, so this is the type
                being honest rather than a case staff will meet.
              */}
              <button
                type="button"
                onClick={() => setOpened(index)}
                disabled={gift.code === null}
                data-testid="open-gift"
                aria-label={t('sheet.showCode', { name: gift.name })}
                className="flex w-full items-baseline justify-between gap-3 text-left disabled:cursor-default"
              >
                <span className="text-sm" style={{ color: 'var(--body)' }}>
                  {gift.name}
                </span>
                {gift.code !== null && (
                  <span
                    data-testid="issued-code"
                    className="font-mono text-sm tracking-wider"
                    style={{ color: 'var(--heading)' }}
                  >
                    {gift.code}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-center text-xs" style={{ color: 'var(--body)' }}>
          {t('sheet.showAtCounter')}
        </p>

        {celebrating && <Confetti />}

        {/* F28 R14: the stall can move on to the person behind them. */}
        <button
          type="button"
          onClick={() => void onNextPlayer()}
          data-testid="next-player"
          className={`${buttonClass} mt-6`}
        >
          {t('player.nextCustomer')}
        </button>
      </Screen>
    )
  }

  return (
    <Screen theme={sheet.branding.theme}>
      <PlayerHeader branding={sheet.branding} />

      <h2 className="mt-6 text-center text-lg font-semibold" style={{ color: 'var(--heading)' }}>
        {t('sheet.ready')}
      </h2>

      {/* F28 §9: what is on the sheet, before anybody presses anything. A
          sheet has nothing to hide — the player is getting all of it. */}
      <ul className="mt-4 w-full space-y-1" data-testid="sheet-gifts">
        {sheet.gifts.map((gift, index) => (
          <li
            key={`${gift.name}-${index}`}
            data-testid="sheet-gift"
            className="text-center text-sm"
            style={{ color: 'var(--body)' }}
          >
            {gift.name}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => void onGet()}
        disabled={giving}
        data-testid="get-gifts"
        className={`${buttonClass} mt-6`}
      >
        {giving ? t('sheet.getting') : t('sheet.get')}
      </button>

      {error !== null && (
        <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}
    </Screen>
  )
}

/**
 * The themed frame, as the wheel's page has it (F04, F06).
 *
 * Phone-first (the repository's CLAUDE.md): the control and then the codes
 * sit in the middle of the viewport with nothing above them to scroll past.
 */
function Screen({ theme, children }: { theme: string; children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-hidden" data-theme={theme}>
      <ThemeScene theme={theme} />

      <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-4 py-6">
        {children}
      </main>

      <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
        <LanguagePicker />
      </div>
    </div>
  )
}

const buttonClass =
  'rounded-full px-6 py-3 text-base font-semibold shadow disabled:cursor-not-allowed disabled:opacity-50'
