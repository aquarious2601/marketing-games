import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout } from './admin/AdminLayout'
import { GameModule } from './admin/GameModule'
import { PlayersModule } from './admin/PlayersModule'
import { SpinsModule } from './admin/SpinsModule'
import { AdminShell } from './auth/AdminShell'
import { LoginPage } from './auth/LoginPage'
import { RequireSession } from './auth/RequireSession'
import { PlayerPage } from './player/PlayerPage'

function App() {
  return (
    <Routes>
      {/* The game itself stays open to everyone (F07 R19). */}
      <Route path="/" element={<PlayerPage />} />

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
        {/* F09 R3: /admin opens the Game module, so every link, bookmark
            and test that predates F09 still works. */}
        <Route index element={<Navigate to="game" replace />} />
        <Route path="game" element={<GameModule />} />
        <Route path="players" element={<PlayersModule />} />
        <Route path="spins" element={<SpinsModule />} />
        {/* F09 R4: an unrecognised module is the Game module, not a dead
            end inside an otherwise working admin. */}
        <Route path="*" element={<Navigate to="/admin/game" replace />} />
      </Route>

      <Route path="*" element={<PlayerPage />} />
    </Routes>
  )
}

export default App
