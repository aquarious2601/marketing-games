import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import {
  fetchIdentity,
  fetchPlayerWheel,
  forgetPlayer,
  spin,
  type PlayerIdentity,
  type PlayerWheel,
  type SpinReward,
} from '../api/player'
import { ThemeScene } from '../branding/ThemeScene'
import { useT } from '../i18n/I18nContext'
import { LanguagePicker } from '../i18n/LanguagePicker'
import { themeFor, themeStyle } from '../branding/themes'
import { CELEBRATION_MS, Confetti } from './Confetti'
import { IdentityStep } from './IdentityStep'
import { PlayerHeader } from './PlayerHeader'
import { WheelPreview, type PreviewSlice } from '../games/wheel/WheelPreview'
import { advance, atRest, isSpinning, startSpin, type SpinAnimation } from '../games/wheel/spinAnimation'

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
  /*
   * The name of the prize on screen, not the slice it came from (F20 R7).
   *
   * A name rather than a PlayerPrize because a result can now arrive two
   * ways: from a spin this page animated, and from the server after a reload
   * (F20 R5), where the slice may not exist any more. The only thing the
   * panel ever needed was the name.
   */
  const [result, setResult] = useState<string | null>(null)
  // F13 R20: held beside the prize, because the panel shows both.
  const [reward, setReward] = useState<SpinReward | null>(null)
  const [error, setError] = useState<string | null>(null)
  // F08 R12: what the *server* said, never something this page decided.
  const [player, setPlayer] = useState<PlayerIdentity | null>(null)
  /*
   * F23 R12. Spins left today for this person, or null when the campaign
   * has no limit — which is also what an unidentified visitor gets, since
   * they have no day to count.
   *
   * From the server on every answer, never decremented here: the count is
   * over recorded spins (F23 R3), and a page that kept its own would be
   * wrong the moment the same person played on the second stall phone.
   */
  const [spinsLeft, setSpinsLeft] = useState<number | null>(null)
  // F22 R1. Separate from `result` on purpose: a result stays until Next
  // player, and the celebration is over long before that.
  const [celebrating, setCelebrating] = useState(false)

  // F03 R13: disabled from the moment Spin is pressed until the wheel stops.
  const busy = awaitingSpin || isSpinning(animation)

  // Held in a ref so the transition-end handler always sees the latest
  // result rather than the one captured when the spin started.
  const pendingResult = useRef<string | null>(null)
  const pendingReward = useRef<SpinReward | null>(null)
  const celebrationTimer = useRef<number | null>(null)

  const stopCelebrating = useCallback(() => {
    if (celebrationTimer.current !== null) {
      window.clearTimeout(celebrationTimer.current)
      celebrationTimer.current = null
    }

    setCelebrating(false)
  }, [])

  // A player who hands the phone over mid-celebration unmounts this with a
  // timer still pending.
  useEffect(() => stopCelebrating, [stopCelebrating])

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
        () => ({ player: null, spin: null, spinsLeft: null }),
      ),
    ])

    if (signal?.aborted === true) {
      return
    }

    setPlayer(identity.player)
    setSpinsLeft(identity.spinsLeft)

    /*
     * F20 R6. This identification has already spun, so the result goes
     * straight on screen — at rest, with no spin control anywhere in the
     * document — exactly as it was before the reload that lost it.
     *
     * Set here rather than animated: the spin happened in some earlier page
     * that no longer exists, and replaying its animation would be a
     * ten-second lie about something that already finished.
     */
    if (identity.spin !== null) {
      setResult(identity.spin.prizeName)
      setReward(identity.spin.reward)
      setAnimation(atRest())
    }

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
    if (pendingResult.current === null) {
      return
    }

    const won = pendingReward.current

    setResult(pendingResult.current)
    setReward(won)
    pendingResult.current = null
    pendingReward.current = null

    /*
     * F22 R1, R2, R3. Here and nowhere else: this runs when the settle
     * finishes (F03 R11), which is the moment the player learns what they
     * won. Celebrating on mount instead would be one line shorter and would
     * throw confetti every time somebody reloaded to re-read their code
     * (F20 R6), which is F22 R4.
     *
     * A reward of `nothing` is the losing slice and gets none of this
     * (F17 R1). An *absent* reward is read as a win, which is the same
     * defensive reading F17 R7 takes.
     *
     * The system's reduced-motion preference is deliberately not consulted,
     * exactly as F03 R12 does not consult it for the spin. See F22 R11.
     */
    if (won?.type === 'nothing') {
      return
    }

    setCelebrating(true)
    celebrationTimer.current = window.setTimeout(() => {
      celebrationTimer.current = null
      setCelebrating(false)
    }, CELEBRATION_MS)
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

      pendingResult.current = outcome.prize.name
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
      } else if (caught instanceof ApiError && caught.status === 429) {
        /*
         * F23 R10, R11. This person has used the day, and this page did not
         * know: it was loaded before they played on another device, or
         * before an admin lowered the limit. Re-asking the server is the
         * same recovery the conflict below takes, and it lands on the
         * already-played screen rather than leaving a button that can only
         * fail again.
         */
        await loadWheel()
      } else if (caught instanceof ApiError && caught.status === 409) {
        /*
         * F20 R2: this identification has already spun, and this page did not
         * know — a second tab, or one left open while the spin happened in
         * another. The server holds the result, so the page re-asks for
         * everything rather than guessing, and lands on the result panel.
         */
        await loadWheel()
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
    // F23 R16: and does not inherit the last one's exhausted day either.
    setSpinsLeft(null)
    // F22 R5: the next person does not inherit the last one's confetti.
    stopCelebrating()

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
   * F20 R15: not yet asked is not the same as nobody.
   *
   * `player` is null before the server has answered as well as after it has
   * answered "nobody", and the branch below cannot tell those apart — so
   * until F20 every load painted the phone form for one frame and then
   * replaced it. Harmless-looking, and wrong twice: a returning player was
   * asked for a number they had already given, and since F20 somebody
   * reloading to re-read their code was shown a form first.
   *
   * So neither screen is drawn while the question is open. The card and the
   * branding stay, because they are true whoever this turns out to be (F04).
   */
  if (load.phase === 'loading') {
    return (
      <Screen theme={wheel.branding.theme}>
        <Stage>
          <PlayerHeader branding={wheel.branding} />

          <p
            role="status"
            data-testid="player-loading"
            className="text-sm"
            style={{ color: 'var(--body)' }}
          >
            {t('common.loading')}
          </p>

          <LanguagePicker />
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
              setPlayer(identified.player)
              // F23 R13: known before a wheel is drawn, so nobody is offered
              // a spin that is about to be refused.
              setSpinsLeft(identified.spinsLeft)
              setError(null)
            }}
          />

          <LanguagePicker />
        </Stage>
      </Screen>
    )
  }

  /**
   * F23 R14. This person has no spins left today.
   *
   * Returned before the wheel, like the phone step above it, so there is no
   * spin control anywhere in the document rather than a disabled one — the
   * same rule F10 R8 holds for a result on screen.
   *
   * Only while nothing is on screen from this session: somebody who has just
   * played has both used their last spin *and* a result to read, and the
   * result wins (F20 R6). Without that condition the prize and the code
   * would vanish the instant they were won.
   *
   * What it does not say is as deliberate as what it does (F23 R15). Not the
   * prize, not the code, not how many times they played — anybody may type
   * anybody's number into a stall phone, and this screen is shown to whoever
   * types it.
   */
  if (spinsLeft === 0 && result === null) {
    return (
      <Screen theme={wheel.branding.theme}>
        <Stage>
          <PlayerHeader branding={wheel.branding} />

          <div
            role="status"
            data-testid="spins-exhausted"
            className="player-result w-[min(19rem,100%)] rounded-2xl border p-5 text-center"
            style={{
              backgroundColor: 'var(--panel-bg)',
              borderColor: 'var(--panel-border)',
              color: 'var(--panel-text)',
              boxShadow: '0 18px 40px -12px rgba(0, 0, 0, 0.65)',
            }}
          >
            <p className="player-kicker" style={{ color: 'var(--panel-heading)' }}>
              {t('player.alreadyPlayedKicker')}
            </p>
            <p className="mt-1 text-xl font-bold" style={{ color: 'var(--panel-heading)' }}>
              {t('player.alreadyPlayedToday')}
            </p>
            <p className="mt-2 text-xs">{t('player.comeBackTomorrow')}</p>
          </div>

          {/* F23 R16. The same control the result screen offers, for the
              same reason: this is a stall's device and the queue behind
              this person has to be able to play. */}
          <button
            type="button"
            onClick={() => void handOver()}
            data-testid="next-player-button"
            className={buttonClass}
            style={buttonStyle}
          >
            {t('player.nextPlayer')}
          </button>

          <p className="player-kicker text-center" data-testid="player-identity">
            <span style={{ color: 'var(--body)' }}>
              {t('player.playingAs', { name: player.firstName })}
            </span>
          </p>

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
              {/* No loading state inside the bezel any more: nothing below
                  this point renders until the wheel has loaded, because the
                  page no longer guesses at who is looking at it (F20 R15).
                  The skeleton that used to live here was the other half of
                  the same wrong assumption. */}
              <WheelPreview
                slices={slices}
                rotation={animation.rotation}
                spinDurationMs={animation.durationMs}
                spinEasing={animation.easing}
                onSpinEnd={onPhaseEnd}
                showPointer
              />
            </div>
          </div>

          {/* Behind the panel and outside `wheel-stage`: nothing it does
              may reach the spin's phase handler (F22 R9, F03 R1). */}
          {celebrating && <Confetti />}

          {result !== null && <ResultPanel name={result} reward={reward} />}
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
            disabled={busy}
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

  // F17 R1, R7.
  const lost = reward?.type === 'nothing'

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
      {/* F17 R2. "You won" is read by the one player who did not, so the
          panel asks what the wheel actually gave before it congratulates
          anybody. R7: only `nothing` is a loss — a result carrying no
          reward at all is an old row, and it was a win. */}
      <p className="player-kicker" style={{ color: 'var(--panel-heading)' }}>
        {lost ? t('player.thanksForPlaying') : t('player.youWon')}
      </p>
      <p className="mt-1 text-xl font-bold" style={{ color: 'var(--panel-heading)' }}>
        {name}
      </p>
      {/* F13 R20 with F16 R1, R6. In a monospace face and spaced out,
          because this is read aloud across a counter and typed back in by
          somebody else. Every win carries one now — the losing slice is
          what is left with nothing to show (F16 R2). */}
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

      {/* F17 R3, then F16 R6a. A losing player is never given a claim
          instruction: there is nothing to claim (F13 R24), and staff are
          not offered the control either, so the old wording sent somebody
          to a counter that would turn them away. Where there is a code the
          instruction is the code, because F10 made "show this screen"
          something the next player's tap undoes. */}
      <p className="mt-2 text-xs">
        {lost
          ? t('player.betterLuck')
          : reward?.code != null
            ? t('player.claimByCode')
            : t('player.claim')}
      </p>
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
