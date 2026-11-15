import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import {
  fetchIdentity,
  fetchPlayerWheel,
  forgetPlayer,
  spin,
  type PlayerIdentity,
  type PlayerPrize,
  type PlayerWheel,
  type SpinReward,
} from '../api/player'
import { ThemeScene } from '../branding/ThemeScene'
import { useT } from '../i18n/I18nContext'
import { LanguagePicker } from '../i18n/LanguagePicker'
import { themeFor, themeStyle } from '../branding/themes'
import { IdentityStep } from './IdentityStep'
import { PlayerHeader } from './PlayerHeader'
import { WheelPreview, type PreviewSlice } from '../wheel/WheelPreview'
import { advance, atRest, isSpinning, startSpin, type SpinAnimation } from './spinAnimation'

type LoadState =
  | { phase: 'loading' }
  | { phase: 'ready' }
  | { phase: 'failed' }

/**
 * F02: the player's page.
 *
 * The server decides what is won (F02 R4) and this page animates to it. The
 * prize is never derived from where the wheel stops — the rotation is
 * computed from the result, not the other way round.
 *
 * F08 put a step in front of all of it: there is no wheel and no Spin button
 * on this page until the server says who it is talking to (F08 R1). The
 * identity is never held here — `fetchIdentity` asks the server, which holds
 * it in a session cookie the page cannot read (F08 R12), so a reload is
 * answered without asking the player anything (F08 R13).
 */
export function PlayerPage() {
  const t = useT()
  const [load, setLoad] = useState<LoadState>({ phase: 'loading' })
  const [wheel, setWheel] = useState<PlayerWheel>({
    prizes: [],
    branding: {
      companyName: null,
      campaignName: null,
      // Replaced the moment the wheel loads; this only covers the first paint.
      tagline: t('player.tagline'),
      theme: 'plain',
      // Replaced the moment the wheel loads, like everything else here;
      // this only has to be a currency, not the right one.
      currency: 'VND',
      currencySymbol: '₫',
      logoUrl: null,
    },
  })
  // F03: the whole spin — phase, angle, duration and easing — lives in one
  // value, so the wheel can never be mid-phase with a stale duration.
  const [animation, setAnimation] = useState<SpinAnimation>(() => atRest())
  const [awaitingSpin, setAwaitingSpin] = useState(false)
  const [result, setResult] = useState<PlayerPrize | null>(null)
  // F13 R20: held beside the prize, because the panel shows both.
  const [reward, setReward] = useState<SpinReward | null>(null)
  const [error, setError] = useState<string | null>(null)
  // F08 R12: what the *server* said, never something this page decided.
  const [player, setPlayer] = useState<PlayerIdentity | null>(null)

  // F03 R13: disabled from the moment Spin is pressed until the wheel stops.
  const busy = awaitingSpin || isSpinning(animation)

  // Held in a ref so the transition-end handler always sees the latest
  // result rather than the one captured when the spin started.
  const pendingResult = useRef<PlayerPrize | null>(null)
  const pendingReward = useRef<SpinReward | null>(null)

  /**
   * The wheel and the identity are fetched together, not one after the other.
   *
   * They are independent — the wheel is public and the identity is a question
   * about this browser — and a player at a stall on a bad connection should
   * not wait for two round trips in series before the page can show them
   * anything.
   *
   * A failed identity check is *not* a failed load: it leaves the page
   * unidentified, which is the phone step, which is a working page. Only the
   * wheel failing means there is no game to show.
   */
  const loadWheel = useCallback(async (signal?: AbortSignal) => {
    setLoad({ phase: 'loading' })

    const [loaded, identity] = await Promise.all([
      fetchPlayerWheel({ signal }).then(
        (value) => ({ ok: true as const, value }),
        () => ({ ok: false as const, value: null }),
      ),
      fetchIdentity({ signal }).then(
        (value) => value,
        () => null,
      ),
    ])

    if (signal?.aborted === true) {
      return
    }

    setPlayer(identity)

    if (!loaded.ok) {
      setLoad({ phase: 'failed' })

      return
    }

    setWheel(loaded.value)
    setLoad({ phase: 'ready' })
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    void loadWheel(controller.signal)

    return () => controller.abort()
  }, [loadWheel])

  const reveal = useCallback(() => {
    if (pendingResult.current !== null) {
      setResult(pendingResult.current)
      setReward(pendingReward.current)
      pendingResult.current = null
      pendingReward.current = null
    }
  }, [])

  /**
   * Each phase's transition ending starts the next (F03 R1). The result is
   * revealed only when the settle finishes (F03 R11).
   */
  const onPhaseEnd = useCallback(() => {
    setAnimation((current) => {
      const next = advance(current)

      if (next.phase === 'idle' && current.phase !== 'idle') {
        reveal()
      }

      return next
    })
  }, [reveal])

  const onSpin = async () => {
    if (busy) {
      return
    }

    setAwaitingSpin(true)
    setResult(null)
    setReward(null)
    setError(null)

    try {
      const outcome = await spin()

      // The wheel may have been reconfigured since this page loaded, so the
      // slice list is refreshed before working out where to stop.
      const current = await fetchPlayerWheel()
      setWheel(current)

      pendingResult.current = outcome.prize
      pendingReward.current = outcome.reward

      // F03 R12: every player gets the full spin, including those whose
      // system asks for reduced motion. See F03 section 13 for that decision
      // and what it costs.
      setAnimation((previous) =>
        startSpin(previous.rotation, outcome.prize.position, current.prizes.length),
      )
    } catch (caught) {
      // F02 R17 / F03 R14: no prize announced, no animation, wheel unmoved.
      pendingResult.current = null
      pendingReward.current = null

      /**
       * F08 R16: a 403 means the server is not willing to say who this is any
       * more — a session that lapsed, or a player deleted between loading the
       * page and pressing Spin. Returning to the phone step is the only
       * honest response: leaving the wheel up with an error would offer a
       * button that can never work again.
       */
      if (caught instanceof ApiError && caught.status === 403) {
        setPlayer(null)
        setError(t('player.identityLost'))
      } else {
        setError(t('player.spinFailed'))
      }
    } finally {
      setAwaitingSpin(false)
    }
  }

  /**
   * Stop being this player (F08 R14, F10 R3).
   *
   * One function for what the page offers as two controls, because they are
   * the same action arrived at for two different reasons: "Not you?" is a
   * wrong number caught before spinning, and "Next player" is a device being
   * handed on after a result. Both end with nobody identified and the phone
   * step on screen.
   *
   * The state is cleared before the request rather than after, so a tap is
   * answered at once (F10 R3): the person handing a device over must see the
   * last player's name gone immediately. A failed call is survivable because
   * the next identification replaces the server session anyway — and the
   * server is still told (F10 R4), since clearing only the page would leave a
   * reload putting the next person back on the previous player's identity.
   */
  const handOver = async () => {
    setPlayer(null)
    setResult(null)
    setReward(null)
    setError(null)
    setAnimation(atRest())

    try {
      await forgetPlayer()
    } catch {
      // Nothing to tell the player: they have already stopped being that
      // player as far as this page is concerned.
    }
  }

  const slices: PreviewSlice[] = wheel.prizes.map((prize) => ({
    key: String(prize.id ?? prize.position),
    name: prize.name,
    // F02 R2: the player is never shown the odds, and never receives them.
    probability: null,
  }))

  if (load.phase === 'failed') {
    return (
      <Screen theme={wheel.branding.theme}>
        <Stage>
          <div role="alert" className="space-y-4 text-center">
            <p className="text-sm" style={{ color: 'var(--danger)' }}>
              {t('player.loadFailed')}
            </p>
            <button
              type="button"
              onClick={() => void loadWheel()}
              className={buttonClass}
              style={buttonStyle}
            >
              {t('common.tryAgain')}
            </button>
          </div>
        </Stage>
      </Screen>
    )
  }

  /**
   * F08 R1: the step in front of the wheel.
   *
   * Returned before the wheel rather than rendered beside it, so there is no
   * Spin button anywhere in the document while nobody is identified — not
   * disabled, not hidden, absent. The header and the card stay, so the
   * campaign's branding is the first thing read either way (F04).
   */
  if (player === null) {
    return (
      <Screen theme={wheel.branding.theme}>
        <Stage>
          <PlayerHeader branding={wheel.branding} />

          {error !== null && (
            <p role="alert" className="text-sm" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          )}

          <IdentityStep
            onIdentified={(identified) => {
              setPlayer(identified)
              setError(null)
            }}
          />

          <LanguagePicker />
        </Stage>
      </Screen>
    )
  }

  return (
    <Screen theme={wheel.branding.theme}>
      <Stage>
        <PlayerHeader branding={wheel.branding} />

        {/* The wheel and the prize it wins share one box, because the prize
            is revealed on top of the wheel rather than beneath the button.
            See <ResultPanel /> for why. */}
        <div className="relative flex w-full justify-center">
          <div
            className="player-wheel relative isolate"
            data-testid="wheel-stage"
            data-phase={animation.phase}
          >
            {/* The scene's light, gathered behind the wheel. Decorative, out
                of the flow and below the wheel, so it cannot shift the layout
                or intercept a tap while the face is turning (F03).

                It stops 12px short of the elements either side — half the gap
                — because it is the one translucent thing inside the card, and
                the card is where the contrast-tested text lives. `isolate`
                keeps the negative z-index local, so this stays above the card
                and below the wheel rather than falling behind the card
                entirely. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-3 -z-10 rounded-full"
              style={{
                background: 'radial-gradient(circle, var(--accent) 0%, transparent 72%)',
                opacity: 0.35,
              }}
            />

            {/* A bezel, so the wheel is mounted in the scene rather than
                floating on top of it. Static: no transition lives on anything
                inside wheel-stage, because a transitionend here would bubble
                into the face's phase handler and advance the spin. */}
            <div
              className="relative aspect-square w-full rounded-full border-2 p-1"
              style={{
                borderColor: 'var(--wheel-rim)',
                backgroundImage:
                  'radial-gradient(circle at 50% 0%, var(--stage) 0%, var(--stage-edge) 100%)',
                boxShadow: '0 18px 40px -18px rgba(0, 0, 0, 0.55)',
              }}
            >
              {load.phase === 'loading' ? (
                <div
                  role="status"
                  className="flex aspect-square w-full items-center justify-center rounded-full border-2 border-dashed text-sm"
                  style={{ borderColor: 'var(--stage-border)', color: 'var(--body)' }}
                >
                  {t('common.loading')}
                </div>
              ) : (
                <WheelPreview
                  slices={slices}
                  rotation={animation.rotation}
                  spinDurationMs={animation.durationMs}
                  spinEasing={animation.easing}
                  onSpinEnd={onPhaseEnd}
                  showPointer
                />
              )}
            </div>
          </div>

          {result !== null && <ResultPanel name={result.name} reward={reward} />}
        </div>

        {/*
          F10 R1, R8: once a result is on screen the spin control is not
          disabled, it is **absent**, and the button in its place hands the
          device on. Two separate elements rather than one that changes its
          label and its handler, so that "there is no way to spin from here"
          is a fact about the document and not about a condition inside a
          click handler.

          This is a stall's device, not the player's own phone. What has to
          happen after a result is the *next* person starting; what must not
          is the next person spinning as the last one.
        */}
        {result === null ? (
          <button
            type="button"
            onClick={() => void onSpin()}
            disabled={load.phase !== 'ready' || busy}
            data-testid="spin-button"
            className={buttonClass}
            style={buttonStyle}
          >
            {busy ? t('player.spinning') : t('player.spin')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handOver()}
            data-testid="next-player-button"
            className={buttonClass}
            style={buttonStyle}
          >
            {t('player.nextPlayer')}
          </button>
        )}

        {error !== null && (
          <p role="alert" className="text-sm" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}

        {/* Who the game thinks is playing, and the way out of it (F08 R14).
            Below the button rather than in the header, because the top of the
            card belongs to the campaign's branding; and its height is paid
            for in `--wheel-chrome`, so a short window shrinks the wheel
            rather than growing a scrollbar.

            The *line* stays once a result is up and only the control inside
            it goes (F10 R9). Dropping the whole line would shorten the card
            at the exact moment the prize appears, and since the screen
            centres its content that is a jolt under the thumb that just
            pressed Spin — which is the one thing <ResultPanel /> was built
            to avoid. "Next player" already offers the hand-over, so what is
            removed is the duplicate, not the row it sat in. */}
        <p className="player-kicker text-center" data-testid="player-identity">
          <span style={{ color: 'var(--body)' }}>
            {t('player.playingAs', { name: player.firstName })}
          </span>{' '}
          {result === null && (
            <button
              type="button"
              onClick={() => void handOver()}
              disabled={busy}
              data-testid="forget-player"
              className="underline decoration-dotted underline-offset-4 hover:opacity-80 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
              // `--heading`, not `--accent`: the accent is a decorative token
              // and is contrast-checked only where it is a hairline or a glow,
              // never behind words (see CONTRAST_PAIRS). The underline is what
              // separates this from the text beside it.
              style={{ color: 'var(--heading)' }}
            >
              {t('player.notYou')}
            </button>
          )}
        </p>

        {/* F12 R5. At the foot of the card: out of the way of the game, and
            reachable at the moment somebody realises they cannot read it.
            Its height is paid for in `--wheel-chrome`, so a short window
            shrinks the wheel rather than growing a scrollbar. */}
        <LanguagePicker />
      </Stage>
    </Screen>
  )
}

/**
 * The prize, revealed over the middle of the wheel.
 *
 * It is positioned rather than in the flow on purpose. In the flow it sat
 * below the Spin button, and the button is already at the bottom of a phone
 * window: the panel landed under the fold, so the player who had just
 * watched six seconds of wheel had to scroll to find out what they had won.
 * Over the wheel it is on screen the instant it exists, at every size, and
 * the card's height never changes — nothing shifts under the thumb that
 * pressed Spin, and the button beneath it (Next player, since F10) stays
 * exactly where Spin was.
 *
 * It sits outside `wheel-stage` because its entrance is an animation on a
 * positioned element: anything animated or transitioned inside that box
 * would bubble a transitionend into the face's phase handler and advance the
 * spin. `pointer-events-none` lets a tap through to the wheel beneath, since
 * there is nothing here to press.
 *
 * The panel is narrower than the card so that the rim, the pointer and the
 * slices either side of it stay visible: the player can see where the wheel
 * stopped as well as read what it stopped on.
 */
function ResultPanel({ name, reward }: { name: string; reward: SpinReward | null }) {
  const t = useT()

  return (
    <div
      role="status"
      data-testid="spin-result"
      className={[
        'player-result pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
        'w-[min(17rem,100%)] overflow-hidden rounded-2xl border p-4 pt-5 text-center',
        'sm:w-[min(19rem,100%)]',
      ].join(' ')}
      style={{
        backgroundColor: 'var(--panel-bg)',
        borderColor: 'var(--panel-border)',
        color: 'var(--panel-text)',
        // Lifted further off its surface than the in-flow panel was: this one
        // floats over a turning face rather than sitting on the card.
        boxShadow: '0 18px 40px -12px rgba(0, 0, 0, 0.65)',
      }}
    >
      {/* A ribbon along the top edge. Above the panel's surface but clear of
          every line of text, so the colour behind the words is still the
          tested `--panel-bg`. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: 'var(--panel-heading)' }}
      />
      <p className="player-kicker" style={{ color: 'var(--panel-heading)' }}>
        {t('player.youWon')}
      </p>
      <p className="mt-1 text-xl font-bold" style={{ color: 'var(--panel-heading)' }}>
        {name}
      </p>
      {/* F13 R20. In a monospace face and spaced out, because this is read
          aloud across a counter and typed back in by somebody else. Only a
          discount has one (F13 R19); a free product is still claimed by
          showing the screen. */}
      {reward?.code != null && (
        <p className="mt-3" data-testid="reward-code">
          <span className="player-kicker block" style={{ color: 'var(--panel-heading)' }}>
            {t('player.yourCode')}
          </span>
          <span className="mt-0.5 block font-mono text-lg font-bold tracking-[0.12em]">
            {reward.code}
          </span>
        </p>
      )}

      <p className="mt-2 text-xs">{t('player.claim')}</p>
    </div>
  )
}

/**
 * The themed page: a flat colour, a scene on top of it, and the content on
 * top of that.
 *
 * The flat `backgroundColor` stays exactly what it always was — the scene is
 * a layer above it rather than a replacement for it — so the page still has
 * one knowable page colour, which is what both the contrast test and the
 * end-to-end check of each theme read.
 */
function Screen({
  children,
  theme,
}: {
  children: React.ReactNode
  theme?: string | null
}) {
  const tokens = themeFor(theme)

  return (
    <main
      className="relative isolate flex min-h-dvh flex-col items-center justify-center px-4 py-8"
      data-testid="player-screen"
      data-theme={theme ?? 'plain'}
      style={{ ...themeStyle(tokens), backgroundColor: tokens.background }}
    >
      <ThemeScene theme={theme} />

      {children}
    </main>
  )
}

/**
 * The card everything readable sits on.
 *
 * This is what makes a scene behind the content safe: the words are never on
 * the scenery, they are on two opaque colours that a test measures (see
 * CONTRAST_PAIRS and the gradient walk in themes.test.ts).
 */
function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="player-card relative z-10 flex w-full flex-col items-center gap-6 rounded-[28px] border p-4 sm:p-6 md:gap-7"
      style={{
        backgroundColor: 'var(--stage)',
        backgroundImage: 'linear-gradient(168deg, var(--stage) 0%, var(--stage-edge) 100%)',
        borderColor: 'var(--stage-border)',
        boxShadow:
          '0 28px 60px -30px rgba(2, 6, 23, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.07)',
      }}
    >
      {children}
    </div>
  )
}

const buttonClass = [
  // Grows with the card: a 14rem button under a 480px wheel reads as an
  // afterthought, and this is the control the whole page exists for.
  'w-full max-w-[14rem] rounded-full px-6 py-3 text-base font-semibold',
  'md:max-w-[17rem] md:py-3.5 md:text-lg',
  'transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
  'focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-[color:var(--stage)]',
].join(' ')

/**
 * Lit from above rather than flat. Both ends of the gradient are tokens and
 * both are contrast-checked against the label, as is the blend between them.
 */
const buttonStyle: React.CSSProperties = {
  backgroundColor: 'var(--button-bg)',
  backgroundImage: 'linear-gradient(180deg, var(--button-shine) 0%, var(--button-bg) 100%)',
  color: 'var(--button-text)',
  boxShadow: '0 12px 26px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.22)',
}
