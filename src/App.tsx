import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './components/RequireAuth'
import { Home } from './pages/Home'
import { SignIn } from './pages/SignIn'
import { Onboarding } from './pages/Onboarding'
import { SetupHome } from './pages/SetupHome'
import { StickerLibrary } from './pages/StickerLibrary'
import { KidManager } from './pages/KidManager'
import { ChoreManager } from './pages/ChoreManager'
import { RewardManager } from './pages/RewardManager'
import { History } from './pages/History'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/signin" element={<SignIn />} />
        <Route
          path="/onboarding"
          element={
            <RequireAuth>
              <Onboarding />
            </RequireAuth>
          }
        />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Home />
            </RequireAuth>
          }
        />
        <Route
          path="/setup"
          element={
            <RequireAuth>
              <SetupHome />
            </RequireAuth>
          }
        />
        <Route
          path="/setup/stickers"
          element={
            <RequireAuth>
              <StickerLibrary />
            </RequireAuth>
          }
        />
        <Route
          path="/setup/kids"
          element={
            <RequireAuth>
              <KidManager />
            </RequireAuth>
          }
        />
        <Route
          path="/setup/chores"
          element={
            <RequireAuth>
              <ChoreManager />
            </RequireAuth>
          }
        />
        <Route
          path="/setup/rewards"
          element={
            <RequireAuth>
              <RewardManager />
            </RequireAuth>
          }
        />
        <Route
          path="/history"
          element={
            <RequireAuth>
              <History />
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  )
}
