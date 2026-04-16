/**
 * App.jsx — Routing
 * ──────────────────────────────────────────────────────────────────────────
 * React Router v6 handles all navigation here.
 *
 * Key concepts:
 *
 *  <BrowserRouter>   → enables URL-based navigation (uses the History API,
 *                      so /login looks like a real URL, not /#/login).
 *                      Wraps everything in main.jsx, not here.
 *
 *  <Routes>          → looks at the current URL and renders the first
 *                      <Route> whose path matches.
 *
 *  <Route>           → maps a path to a component.
 *
 *  <Navigate>        → programmatic redirect inside JSX. Used for:
 *                      1. Redirecting / → /login
 *                      2. Protecting /dashboard from unauthenticated users
 *
 *  <ProtectedRoute>  → a wrapper component we wrote that checks isAuthenticated.
 *                      If the user isn't logged in, it redirects to /login
 *                      instead of rendering the children.
 *
 * Route map:
 *   /               → redirect to /login
 *   /login          → LoginPage   (redirect to /dashboard if already logged in)
 *   /register       → RegisterPage (redirect to /dashboard if already logged in)
 *   /dashboard      → DashboardPage (protected — requires auth)
 */

import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'

import LandingPage   from './pages/LandingPage'
import LoginPage     from './pages/auth/LoginPage'
import RegisterPage  from './pages/auth/RegisterPage'
import DashboardPage from './pages/DashboardPage'

// ── ProtectedRoute ─────────────────────────────────────────────────────────
/**
 * Wraps any route that requires authentication.
 *
 * If the user IS logged in     → render the children normally
 * If the user is NOT logged in → redirect to /login
 *
 * `replace` on <Navigate> prevents the protected URL from appearing in
 * browser history — hitting Back won't loop the user back to a 401.
 */
function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return children
}

// ── PublicOnlyRoute ────────────────────────────────────────────────────────
/**
 * Wraps routes that should NOT be accessible once logged in.
 * (You don't want a logged-in user landing on /login and seeing the form again.)
 *
 * If the user IS logged in     → redirect to /dashboard
 * If the user is NOT logged in → render the page normally
 */
function PublicOnlyRoute({ children }) {
  const { isAuthenticated } = useAuth()

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

// ── App ────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <Routes>
      {/* Landing page — public, accessible whether logged in or not */}
      <Route path="/" element={<LandingPage />} />

      {/* Public-only routes */}
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnlyRoute>
            <RegisterPage />
          </PublicOnlyRoute>
        }
      />

      {/* Protected routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />

      {/* Catch-all: anything that doesn't match → landing page */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}