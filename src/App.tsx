import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './components/RequireAuth'
import { Home } from './pages/Home'
import { SignIn } from './pages/SignIn'
import { Onboarding } from './pages/Onboarding'

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
      </Routes>
    </AuthProvider>
  )
}
