import { NavLink, Outlet } from 'react-router-dom'
import { useT } from '../i18n/I18nContext'
import type { MessageKey } from '../i18n/en'

/**
 * The three modules and the strip that moves between them (F09 R1, R5).
 *
 * Separate from AdminShell on purpose. The shell is about the session — who
 * is signed in, how to leave, what happens when a cookie expires — and knows
 * nothing about what the admin contains. This knows about modules and
 * nothing about sessions.
 *
 * It renders an <Outlet /> rather than taking the modules as props, which is
 * what makes F09 R6 true by construction: the module that is not on screen is
 * not rendered, so it cannot be fetching. A tab strip holding its state in
 * React would have had all three mounted and would have needed discipline
 * instead.
 */
export function AdminLayout() {
  const t = useT()

  return (
    <>
      {/* F09 R5 is half satisfied by NavLink itself: it sets
          `aria-current="page"` on the active link, which is what makes
          "which of these am I on" answerable without seeing the underline.
          The test asserts it rather than trusting it, because it is a
          behaviour of the router and not of this file. */}
      <nav
        aria-label={t('admin.modules')}
        data-testid="admin-tabs"
        className="border-b border-slate-200 bg-white"
      >
        {/* Same max width and gutter as the module below it, so the current
            tab lines up with the content it belongs to. */}
        <div className="mx-auto flex w-full max-w-5xl gap-1 px-4">
          {MODULES.map((module) => (
            <NavLink
              key={module.path}
              to={module.path}
              data-testid={`admin-tab-${module.path}`}
              /*
                No `end` since F27: Games has a child route — the editor for
                one game at /admin/games/:id — and the tab has to stay marked
                while an admin is inside it. None of the others is a prefix
                of another, so an exact match buys nothing elsewhere.
              */
              className={({ isActive }) =>
                [
                  'border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500',
                  isActive
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800',
                ].join(' ')
              }
            >
              {t(module.label)}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* One <main> for the whole admin; each module supplies its own <h1>
          and its sections (F09 R8). */}
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </>
  )
}

/**
 * The modules, in the order they are used: the shop is filled in once, its
 * games are set up and edited, and the last two are read every day.
 *
 * Store first because every game inherits it, and because a shop fills it in
 * before it has a game to run (F27 R10).
 *
 * "Spins" rather than "Activity" or "History" because `spin` is the word the
 * code and the database already use — the spin table, `spunAt`, the spin log
 * — and an interface that invents a second word for an existing thing makes
 * every later conversation ambiguous.
 *
 * Rewards sits beside Game rather than after Players (F13): the catalogue is
 * something you set up, like the wheel, and the two modules after it are
 * things you read.
 */
const MODULES: ReadonlyArray<{ path: string; label: MessageKey }> = [
  { path: 'store', label: 'store.title' },
  { path: 'games', label: 'games.title' },
  { path: 'rewards', label: 'rewards.title' },
  { path: 'players', label: 'players.title' },
  { path: 'spins', label: 'spins.title' },
  /*
   * F32 R22, and the sixth. F09 said three was right for three and that six
   * would make the navigation its own decision: this is six, the strip is
   * still one row of short words, and a seventh is where the grouping F09
   * warned about has to happen.
   */
  { path: 'stats', label: 'stats.title' },
]
