import { useState } from 'react'
import type { Branding } from '../api/branding'

interface PlayerHeaderProps {
  branding: Branding
}

/**
 * Whose promotion this is (F04 R23–R26).
 *
 * Everything here is optional. With nothing configured the page reads
 * exactly as it did before F04, which is the point of R25: no gaps, no
 * placeholders, no "Your logo here".
 */
export function PlayerHeader({ branding }: PlayerHeaderProps) {
  // F04 R26: a logo that will not load must not take the header with it.
  const [logoBroken, setLogoBroken] = useState(false)

  const showLogo = branding.logoUrl !== null && !logoBroken

  return (
    <header className="flex flex-col items-center gap-3 text-center" data-testid="player-header">
      {showLogo && (
        <img
          src={branding.logoUrl ?? undefined}
          alt={branding.companyName ?? 'Logo'}
          data-testid="player-logo"
          onError={() => setLogoBroken(true)}
          className="h-14 w-auto max-w-[70%] object-contain sm:h-[72px]"
        />
      )}

      <div className="space-y-1">
        {/* The theme's one liberty beyond colour: a serif for Christmas, a
            heavy uppercase for Black Friday. See the type treatment in
            index.css, keyed off the screen's data-theme. */}
        <h1
          className="player-heading text-2xl sm:text-3xl md:text-4xl"
          style={{ color: 'var(--heading)' }}
        >
          {/* F04 R24 */}
          {'' === branding.campaignName.trim() ? 'Spin to win' : branding.campaignName}
        </h1>

        {branding.companyName !== null && (
          <p
            className="text-sm font-medium"
            data-testid="player-company"
            style={{ color: 'var(--body)' }}
          >
            {branding.companyName}
          </p>
        )}
      </div>

      {/* A short rule in the theme's accent above the tagline: the cheapest
          way to make a line of small text look set rather than left over.
          Stacked rather than flanking the text, so a long line wraps instead
          of pushing the card wider than a 375px phone. */}
      <div className="flex flex-col items-center gap-2">
        <span
          aria-hidden="true"
          className="block h-px w-14"
          style={{ backgroundColor: 'var(--accent)', opacity: 0.5 }}
        />
        <p className="player-kicker" data-testid="player-tagline" style={{ color: 'var(--body)' }}>
          {/* Always set: the API sends the admin's phrase or the default,
              so the page never has to know which it got. */}
          {branding.tagline}
        </p>
      </div>
    </header>
  )
}
