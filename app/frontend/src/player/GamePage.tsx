import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchGameType, resolvePlay } from '../api/player'
import { SheetPage } from '../games/gift-sheet/SheetPage'
import { useT } from '../i18n/I18nContext'
import { PlayerPage } from './PlayerPage'

type Resolution =
  | { phase: 'loading' }
  | { phase: 'ready'; type: string }
  /**
   * F27 R24, R25. The link named a game that is not live, or no game at all.
   * One screen for both: a customer holding a printed link must not be able
   * to tell a finished promotion from a typo.
   */
  | { phase: 'gone' }
  /** F27 R26. `/` with no single live game: this page needs a link. */
  | { phase: 'needsLink' }

/**
 * Which game this is, and therefore which page to draw (F28).
 *
 * With one game the player page could load the wheel and be done. With two
 * kinds of game something has to ask first — a wheel and a sheet are
 * different screens — and resolving the key is also what binds the session
 * (F27 R20, R27), so the question and the binding are one request.
 */
export function GamePage() {
  const t = useT()
  const { key: playKey } = useParams<{ key: string }>()
  const [resolution, setResolution] = useState<Resolution>({ phase: 'loading' })

  const resolve = useCallback(async (signal?: AbortSignal) => {
    setResolution({ phase: 'loading' })

    try {
      const game =
        playKey === undefined
          ? await fetchGameType({ signal })
          : await resolvePlay(playKey, { signal })

      if (signal?.aborted === true) {
        return
      }

      setResolution({ phase: 'ready', type: game.type })
    } catch {
      if (signal?.aborted === true) {
        return
      }

      /*
       * A key that does not resolve is a promotion that has ended (R24);
       * `/` with nothing to serve is a page that needs a link (R26). The
       * difference is only which of the two was asked.
       */
      setResolution({ phase: playKey === undefined ? 'needsLink' : 'gone' })
    }
  }, [playKey])

  useEffect(() => {
    const controller = new AbortController()

    void resolve(controller.signal)

    return () => controller.abort()
  }, [resolve])

  if (resolution.phase === 'gone' || resolution.phase === 'needsLink') {
    const ended = 'gone' === resolution.phase

    /*
     * Plain on purpose twice over: the unknown case has no branding to
     * carry, and if the two pages looked different the one would tell you
     * the other existed (R25).
     */
    return (
      <div
        className="flex min-h-dvh items-center justify-center bg-slate-50 px-4"
        data-testid={ended ? 'promotion-ended' : 'needs-link'}
      >
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold text-slate-900">
            {t(ended ? 'player.promotionEnded' : 'player.needsLink')}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {t(ended ? 'player.promotionEndedHint' : 'player.needsLinkHint')}
          </p>
        </div>
      </div>
    )
  }

  if (resolution.phase === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50">
        <p role="status" className="text-sm text-slate-500">
          {t('common.loading')}
        </p>
      </div>
    )
  }

  // Each game draws itself. Nothing here knows how either one works.
  return 'gift-sheet' === resolution.type ? <SheetPage /> : <PlayerPage />
}
