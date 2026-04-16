/**
 * AppLayout
 * ──────────────────────────────────────────────────────────────────────────
 * The main shell for authenticated pages.
 * Sidebar (left) + main content area (right).
 *
 * This is a placeholder for now — we'll flesh it out when we build the
 * dashboard. For the login/register sprint it's just needed so the barrel
 * export doesn't break.
 *
 * Usage:
 *   <AppLayout>
 *     <DashboardPage />
 *   </AppLayout>
 */

const AppLayout = ({ children }) => {
  return (
    <div className="ds-root" style={{ minHeight: '100vh', display: 'flex' }}>
      {/* Sidebar goes here — built in the next sprint */}
      <main style={{ flex: 1, padding: '2rem', backgroundColor: 'var(--ds-bg)' }}>
        {children}
      </main>
    </div>
  )
}

export default AppLayout
