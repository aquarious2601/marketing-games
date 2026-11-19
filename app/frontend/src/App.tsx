import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout } from './admin/AdminLayout'
import { GameModule } from './admin/GameModule'
import { GamesModule } from './admin/GamesModule'
import { StoreModule } from './admin/StoreModule'
import { CustomerModule } from './admin/CustomerModule'
import { PlayersModule } from './admin/PlayersModule'
import { RewardsModule } from './admin/RewardsModule'
import { StatsModule } from './admin/StatsModule'
import { SpinsModule } from './admin/SpinsModule'
import { AdminShell } from './auth/AdminShell'
import { LoginPage } from './auth/LoginPage'
import { RequireSession } from './auth/RequireSession'
import { GamePage } from './player/GamePage'

function App() {
  return (
    <Routes>
      {/* The game itself stays open to everyone (F07 R19). */}

      {/*
        F27 R20. Every game has its own link, and this is it. The key is
        opaque and names nothing (R19), so the route cannot be read to learn
        what else the installation runs.
      */}
      <Route path="/play/:key" element={<GamePage />} />

      {/*
        F27 R26. `/` still serves the player page, but only while exactly one
        game is live — which is what the upgrade leaves, so every existing
        link, bookmark and printed QR code keeps working. The page asks the
        server which case it is in; nothing here can tell.
      */}
      <Route path="/" element={<GamePage />} />

      <Route path="/login" element={<LoginPage />} />

      {/*
        F09 R1, R2: three modules, each with its own URL.

        Nested routes rather than a tab strip holding state in React, which
        is what makes F09 R6 true by construction — only the open module is
        mounted, so the others cannot be fetching. The session guard and the
        shell wrap all three (F09 R7), so the frame is identical whichever
        module is open.
      */}
      <Route
        path="/admin"
        element={
          <RequireSession>
            <AdminShell>
              <AdminLayout />
            </AdminShell>
          </RequireSession>
        }
      >
        {/* F27 R36: /admin opens Games, because that is where the work is. */}
        <Route index element={<Navigate to="games" replace />} />

        <Route path="store" element={<StoreModule />} />
        <Route path="games" element={<GamesModule />} />

        {/* One game's editor. A page rather than a panel: with several games
            there is no longer "the" game to show beside the list. */}
        <Route path="games/:id" element={<GameModule />} />

        {/* F27 R36. Where the single Game module used to be, so a bookmark
            from before this feature lands somewhere sensible rather than on
            the fallback below. */}
        <Route path="game" element={<Navigate to="/admin/games" replace />} />
        <Route path="players" element={<PlayersModule />} />
        {/* F31 R10. The counter's screen: one customer, and everything they
            are owed. A page of its own rather than a panel inside the list,
            because its controls have to be reachable at 375px (R29). */}
        <Route path="players/:id" element={<CustomerModule />} />
        <Route path="rewards" element={<RewardsModule />} />
        <Route path="spins" element={<SpinsModule />} />
        {/* F32 R22. The numbers, read at the end of a day or a week. */}
        <Route path="stats" element={<StatsModule />} />
        {/* F09 R4: an unrecognised module is the Games list, not a dead
            end inside an otherwise working admin. */}
        <Route path="*" element={<Navigate to="/admin/games" replace />} />
      </Route>

      <Route path="*" element={<GamePage />} />
    </Routes>
  )
}

export default App
