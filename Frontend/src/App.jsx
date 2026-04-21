/**
 * App.jsx — Routing
 * Route map:
 *   /           → LandingPage    (public)
 *   /about      → AboutPage      (public)
 *   /contact    → ContactPage    (public)
 *   /login      → LoginPage      (public-only)
 *   /register   → RegisterPage   (public-only)
 *   /dashboard  → DashboardPage  (protected)
 *   *           → redirect to /
 */

import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { useEffect, useRef } from 'react'

import LandingPage   from './pages/LandingPage'
import AboutPage     from './pages/AboutPage'
import ContactPage   from './pages/ContactPage'
import LoginPage     from './pages/auth/LoginPage'
import RegisterPage  from './pages/auth/RegisterPage'
import DashboardPage from './pages/DashboardPage'

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

function PublicOnlyRoute({ children }) {
  const { isAuthenticated } = useAuth()
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return children
}

/* Wraps every page in a fade-in on mount + resets scroll on route change
   so navigating from footer links doesn't dump you halfway down the new page. */
function PageTransition({ children }) {
  const ref = useRef(null)
  const { pathname } = useLocation()

  useEffect(() => {
    // Jump to top instantly on every route change — this is the "contact us
    // shouldn't require scrolling back up" fix. Using 'instant' (not 'smooth')
    // so the page appears already at the top under the fade-in.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })

    const el = ref.current
    if (!el) return
    // Start slightly offset + invisible, then release on the next frame
    // so the browser has a chance to paint the "before" state.
    el.style.opacity = '0'
    el.style.transform = 'translateY(10px)'
    el.style.transition = 'none'
    const id = requestAnimationFrame(() => {
      // easeOutQuint — pops in crisply then settles.
      el.style.transition = 'opacity 0.32s cubic-bezier(0.22, 1, 0.36, 1), transform 0.36s cubic-bezier(0.22, 1, 0.36, 1)'
      el.style.opacity = '1'
      el.style.transform = 'translateY(0)'
    })
    return () => cancelAnimationFrame(id)
  }, [pathname])

  return <div ref={ref}>{children}</div>
}

export default function App() {
  const location = useLocation()

  return (
    <>
      <PageTransition>
        <Routes location={location}>
          <Route path="/"        element={<LandingPage />} />
          <Route path="/about"   element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />

          <Route path="/login"    element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
          <Route path="/register" element={<PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>} />

          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </PageTransition>
    </>
  )
}