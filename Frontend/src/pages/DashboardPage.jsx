/**
 * DashboardPage.jsx — shows the user's ideas with evaluation status and links.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { AppLayout } from '../styles'
import { C } from '../styles/components/DashNavbar'
import { listMyIdeas } from '../services/ideaService'

function scoreColor(score) {
  if (score >= 75) return C.brand500
  if (score >= 60) return '#0ea5e9'
  if (score >= 45) return '#f59e0b'
  if (score >= 30) return '#f97316'
  return '#ef4444'
}

function StatusBadge({ status }) {
  const cfg = {
    submitted:  { label: 'Pending',    bg: '#f3f4f6',             color: C.n500,   pulse: false },
    analyzing:  { label: 'Analyzing…', bg: C.brand500 + '12',     color: C.brand600, pulse: true },
    completed:  { label: 'Evaluated',  bg: '#dcfce7',             color: '#15803d', pulse: false },
    failed:     { label: 'Failed',     bg: '#fee2e2',             color: '#dc2626', pulse: false },
  }[status] ?? { label: status, bg: '#f3f4f6', color: C.n500, pulse: false }

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
      padding: '0.2rem 0.6rem', borderRadius: '99px',
      background: cfg.bg, fontSize: '0.75rem', fontWeight: 600, color: cfg.color,
    }}>
      {cfg.pulse && <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: C.brand500, animation: 'pulseDot 1.4s ease-in-out infinite', flexShrink: 0 }} />}
      {cfg.label}
    </span>
  )
}

const SECTOR_LABELS = { retail:'Retail', food:'Food & Bev', education:'Education', tech:'Tech', services:'Services', health:'Health', other:'Other' }

function IdeaCard({ idea }) {
  const { ideaId, title, sector, status, overallScore, verdict, createdAt } = idea
  const hasScore = overallScore != null
  const color = hasScore ? scoreColor(overallScore) : C.n300
  const dateStr = new Date(createdAt).toLocaleDateString('en-JO', { day:'numeric', month:'short', year:'numeric' })

  return (
    <Link to={`/evaluation/${ideaId}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'0.875rem', padding:'1.125rem 1.25rem', boxShadow:'0 1px 3px rgba(0,0,0,0.04)', display:'flex', alignItems:'center', gap:'1rem', transition:'box-shadow 0.15s ease, border-color 0.15s ease, transform 0.15s ease' }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.08)'; e.currentTarget.style.borderColor=C.brand500+'50'; e.currentTarget.style.transform='translateY(-1px)' }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.borderColor='#e5e7eb'; e.currentTarget.style.transform='translateY(0)' }}
      >
        {/* Score circle */}
        <div style={{ width:'3rem', height:'3rem', borderRadius:'50%', background: hasScore ? color+'15' : '#f3f4f6', border:`2px solid ${hasScore ? color : '#e5e7eb'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          {hasScore
            ? <span style={{ fontSize:'0.8125rem', fontWeight:800, color }}>{overallScore}</span>
            : <span style={{ fontSize:'1rem', color:C.n400 }}>–</span>
          }
        </div>
        {/* Info */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'0.9375rem', fontWeight:700, color:C.n900, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginBottom:'0.25rem' }}>{title}</div>
          <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
            <span style={{ fontSize:'0.75rem', fontWeight:500, color:C.n500, background:'#f3f4f6', padding:'0.1rem 0.5rem', borderRadius:'99px' }}>
              {SECTOR_LABELS[sector] ?? sector}
            </span>
            {verdict && <span style={{ fontSize:'0.75rem', color:scoreColor(overallScore), fontWeight:600 }}>{verdict}</span>}
          </div>
        </div>
        {/* Right */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'0.375rem', flexShrink:0 }}>
          <StatusBadge status={status} />
          <span style={{ fontSize:'0.75rem', color:C.n400 }}>{dateStr}</span>
        </div>
        <span style={{ color:C.n300, fontSize:'1rem', flexShrink:0 }}>→</span>
      </div>
    </Link>
  )
}

function EmptyIdeas() {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', padding:'2.5rem 1rem', border:'1.5px dashed #e5e7eb', borderRadius:'0.75rem', background:'#f9fafb' }}>
      <p style={{ fontSize:'0.9375rem', fontWeight:600, color:'#374151', margin:'0 0 0.25rem' }}>No ideas yet</p>
      <p style={{ fontSize:'0.8125rem', color:'#6b7280', margin:0, maxWidth:'340px', lineHeight:1.5 }}>Submit your first idea above to get an AI-powered evaluation.</p>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const firstName = (user?.fullName ?? '').trim().split(/\s+/)[0] || 'there'
  const [ideas, setIdeas] = useState([])
  const [loadState, setLoad] = useState('loading')

  useEffect(() => {
    let cancelled = false
    listMyIdeas()
      .then(data => { if (!cancelled) { setIdeas(Array.isArray(data) ? data : []); setLoad('done') } })
      .catch(() => { if (!cancelled) setLoad('error') })
    return () => { cancelled = true }
  }, [])

  return (
    <AppLayout>
      <style>{`@keyframes pulseDot { 0%,100%{opacity:1} 50%{opacity:0.3} } @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }`}</style>

      {/* Header */}
      <div style={{ marginBottom:'1.5rem' }}>
        <h1 style={{ fontSize:'clamp(1.5rem, 3vw, 1.875rem)', fontWeight:800, color:'#111827', margin:'0 0 0.35rem', letterSpacing:'-0.02em' }}>
          Welcome back, {firstName}
        </h1>
        <p style={{ fontSize:'0.9375rem', color:'#6b7280', margin:0 }}>Ready to validate a new idea? Start below.</p>
      </div>

      {/* CTA */}
      <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'1rem', padding:'1.75rem', boxShadow:'0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.03)', marginBottom:'1.25rem' }}>
        <h2 style={{ fontSize:'1.25rem', fontWeight:800, color:'#111827', margin:'0 0 0.35rem', letterSpacing:'-0.01em' }}>Submit a new business idea</h2>
        <p style={{ fontSize:'0.9375rem', color:'#6b7280', margin:'0 0 1.25rem', lineHeight:1.55, maxWidth:'560px' }}>
          Get an instant AI-powered evaluation — scoring, SWOT analysis, and risk assessment tailored for Jordan.
        </p>
        <Link to="/submit-idea" style={{ display:'inline-flex', alignItems:'center', gap:'0.5rem', padding:'0.75rem 1.25rem', borderRadius:'0.625rem', background:`linear-gradient(180deg,${C.brand500} 0%,${C.brand600} 100%)`, color:'#fff', fontWeight:700, fontSize:'0.9375rem', textDecoration:'none', boxShadow:`0 4px 14px ${C.brand500}35`, transition:'transform 0.15s ease' }}
          onMouseEnter={e=>e.currentTarget.style.transform='translateY(-1px)'} onMouseLeave={e=>e.currentTarget.style.transform='translateY(0)'}>
          → Submit new idea
        </Link>
      </div>

      {/* Ideas list */}
      <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'1rem', padding:'1.75rem', boxShadow:'0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.03)' }}>
        <h3 style={{ fontSize:'1rem', fontWeight:700, color:'#111827', margin:'0 0 1rem', display:'flex', alignItems:'center', gap:'0.5rem' }}>
          Your ideas
          {ideas.length > 0 && <span style={{ fontSize:'0.75rem', fontWeight:600, background:C.brand500+'15', color:C.brand600, padding:'0.15rem 0.5rem', borderRadius:'99px' }}>{ideas.length}</span>}
        </h3>

        {loadState === 'loading' && (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.625rem' }}>
            {[1,2].map(i => <div key={i} style={{ height:'4.5rem', borderRadius:'0.875rem', background:'linear-gradient(90deg,#f3f4f6 0%,#e5e7eb 50%,#f3f4f6 100%)', backgroundSize:'200% 100%', animation:'shimmer 1.4s ease-in-out infinite' }} />)}
          </div>
        )}

        {loadState === 'error' && <p style={{ fontSize:'0.875rem', color:'#ef4444', margin:0 }}>Failed to load ideas. Please refresh.</p>}

        {loadState === 'done' && ideas.length === 0 && <EmptyIdeas />}

        {loadState === 'done' && ideas.length > 0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.625rem' }}>
            {ideas.map(idea => <IdeaCard key={idea.ideaId} idea={idea} />)}
          </div>
        )}
      </div>
    </AppLayout>
  )
}