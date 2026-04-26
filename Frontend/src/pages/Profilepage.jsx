/**
 * ProfilePage.jsx — user info + activity stats
 */

import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { AppLayout } from '../styles'
import { C } from '../styles/components/DashNavbar'
import { listMyIdeas } from '../services/ideaService'

const IconUser  = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/>
  </svg>
)

const IconBadge = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd"/>
    <path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z"/>
  </svg>
)

function InfoRow({ label, value, icon, last }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '0.875rem',
      padding: '1rem 0',
      borderBottom: last ? 'none' : '1px solid #f3f4f6',
    }}>
      <div style={{
        width: '36px', height: '36px', borderRadius: '0.5rem',
        background: C.brand50, display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0, color: C.brand600,
      }}>
        {icon}
      </div>
      <div>
        <div style={{
          fontSize: '0.75rem', fontWeight: 600, color: C.n500,
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.2rem',
        }}>
          {label}
        </div>
        <div style={{ fontSize: '0.9375rem', fontWeight: 500, color: C.n900 }}>
          {value || <span style={{ color: C.n400, fontStyle: 'italic' }}>Not set</span>}
        </div>
      </div>
    </div>
  )
}

function StatPill({ label, value, loading }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.75rem',
      padding: '1rem 1.25rem', textAlign: 'center', flex: 1, minWidth: '100px',
    }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: C.brand600, letterSpacing: '-0.02em' }}>
        {loading ? (
          <div style={{
            height: '1.5rem', width: '2rem', margin: '0 auto', borderRadius: '0.25rem',
            background: 'linear-gradient(90deg,#f3f4f6 0%,#e5e7eb 50%,#f3f4f6 100%)',
            backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite',
          }}/>
        ) : value}
      </div>
      <div style={{ fontSize: '0.8125rem', color: C.n500, marginTop: '0.2rem', fontWeight: 500 }}>
        {label}
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const { user } = useAuth()

  const [ideas,    setIdeas]    = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    let cancelled = false
    listMyIdeas()
      .then(data => {
        if (!cancelled) {
          setIdeas(Array.isArray(data) ? data : [])
          setLoading(false)
        }
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const totalIdeas = ideas.length
  const evaluated  = ideas.filter(i => i.status === 'completed').length
  const scores     = ideas.filter(i => i.overallScore != null).map(i => i.overallScore)
  const avgScore   = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null

  const joinedYear = new Date().getFullYear()

  return (
    <AppLayout>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
      `}</style>

      {/* Page header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{
          fontSize: 'clamp(1.5rem, 3vw, 1.875rem)', fontWeight: 800,
          color: '#111827', margin: '0 0 0.35rem', letterSpacing: '-0.02em',
        }}>
          My Profile
        </h1>
        <p style={{ fontSize: '0.9375rem', color: '#6b7280', margin: 0 }}>
          Your account details and activity.
        </p>
      </div>

      {/* Profile card */}
      <div style={{
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: '1rem',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.03)',
        marginBottom: '1.25rem',
      }}>
        <div style={{
          height: '80px',
          background: `linear-gradient(135deg, ${C.brand400} 0%, ${C.brand700} 100%)`,
        }}/>
        <div style={{ padding: '0 1.75rem 1.5rem', position: 'relative' }}>
          <div style={{ position: 'absolute', top: '-36px' }}>
            <div style={{
              width: '72px', height: '72px', borderRadius: '50%',
              background: `linear-gradient(135deg, ${C.brand400}, ${C.brand600})`,
              border: '3px solid #fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 800, fontSize: '1.5rem',
              boxShadow: '0 4px 12px rgba(29,158,117,0.35)',
              userSelect: 'none', letterSpacing: '-0.02em',
            }}>
              {(user?.fullName ?? '?')
                .trim().split(/\s+/).slice(0, 2)
                .map(w => w[0]?.toUpperCase() ?? '').join('')}
            </div>
          </div>
          <div style={{ height: '44px' }}/>
          <h2 style={{
            fontSize: '1.25rem', fontWeight: 800, color: C.n900,
            margin: '0 0 0.25rem', letterSpacing: '-0.01em',
          }}>
            {user?.fullName ?? 'Anonymous'}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
              padding: '0.2rem 0.65rem',
              background: C.brand50, border: `1px solid ${C.brand200}`,
              borderRadius: '9999px', fontSize: '0.8125rem', fontWeight: 600, color: C.brand700,
            }}>
              <IconUser/> {user?.role ?? 'User'}
            </span>
            <span style={{ fontSize: '0.8125rem', color: C.n500 }}>
              Member since {joinedYear}
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <StatPill label="Ideas submitted"  value={totalIdeas}              loading={loading}/>
        <StatPill label="Evaluations done" value={evaluated}               loading={loading}/>
        <StatPill label="Avg. score"       value={avgScore ?? '—'}         loading={loading}/>
      </div>

      {/* Account details */}
      <div style={{
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: '1rem',
        padding: '1.5rem 1.75rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.03)',
      }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: C.n900, margin: '0 0 0.25rem' }}>
          Account details
        </h3>
        <p style={{ fontSize: '0.8125rem', color: C.n500, margin: '0 0 0.5rem' }}>
          Your personal information.
        </p>
        <InfoRow label="Full name"    value={user?.fullName}       icon={<IconUser/>}/>
        <InfoRow label="Role"         value={user?.role ?? 'User'} icon={<IconBadge/>}/>
        <InfoRow label="Account type" value="Standard"             icon={<IconBadge/>} last/>
      </div>

    </AppLayout>
  )
}