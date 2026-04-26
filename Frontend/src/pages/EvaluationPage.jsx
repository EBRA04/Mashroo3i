/**
 * EvaluationPage.jsx
 * Route: /evaluation/:ideaId
 *
 * Two tabs:
 *   Tab 1 — AI Evaluation & Scoring  (scores, verdict, summary, strengths/concerns/recs)
 *   Tab 2 — SWOT & Risk Assessment   (SWOT quadrants, risk paragraph)
 *
 * No emojis — uses SVG icons and colored dots only.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { AppLayout } from '../styles'
import { C } from '../styles/components/DashNavbar'
import { startEvaluation, getEvaluationResults } from '../services/evaluationService'

const POLL_MS = 3000

// ── Color helpers ──────────────────────────────────────────────────────────

const scoreColor = s =>
  s >= 75 ? C.brand500 : s >= 60 ? '#0ea5e9' : s >= 45 ? '#f59e0b' : s >= 30 ? '#f97316' : '#ef4444'

const riskColor = l =>
  ({ Low: C.brand500, Medium: '#f59e0b', High: '#f97316', Critical: '#ef4444' }[l] ?? C.n400)

const verdictColor = v => {
  if (!v) return C.n400
  const lv = v.toLowerCase()
  if (lv.includes('highly')) return C.brand500
  if (lv.includes('promising')) return '#0ea5e9'
  if (lv.includes('refinement')) return '#f59e0b'
  if (lv.includes('high risk')) return '#f97316'
  return '#ef4444'
}

// ── SVG Icons (no emojis) ──────────────────────────────────────────────────

const IconScore = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
)
const IconChart = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
  </svg>
)
const IconShield = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
)
const IconCheck = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)
const IconArrow = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
)

// ── Score Ring ─────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 140 }) {
  const r = 52, cx = size / 2, cy = size / 2
  const circ = 2 * Math.PI * r
  const filled = (score / 100) * circ
  const color = scoreColor(score)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth="10"/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeDashoffset={circ * 0.25} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)' }}/>
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize="28" fontWeight="800"
        fill={color} fontFamily="inherit">{score}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="11" fontWeight="500"
        fill={C.n400} fontFamily="inherit" letterSpacing="0.08em">/ 100</text>
    </svg>
  )
}

// ── Score Bar ──────────────────────────────────────────────────────────────

function ScoreBar({ label, score }) {
  const color = scoreColor(score)
  return (
    <div style={{ marginBottom: '0.875rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: C.n700 }}>{label}</span>
        <span style={{ fontSize: '0.8125rem', fontWeight: 700, color }}>{score}</span>
      </div>
      <div style={{ height: '6px', background: '#f3f4f6', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: '99px',
          transition: 'width 0.9s cubic-bezier(0.4,0,0.2,1)' }}/>
      </div>
    </div>
  )
}

// ── Verdict Badge ──────────────────────────────────────────────────────────

function VerdictBadge({ verdict }) {
  const color = verdictColor(verdict)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
      padding: '0.3rem 0.75rem', borderRadius: '99px',
      background: color + '18', border: `1px solid ${color}40`,
      color, fontSize: '0.8125rem', fontWeight: 700 }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, flexShrink: 0 }}/>
      {verdict}
    </span>
  )
}

// ── Risk Badge ─────────────────────────────────────────────────────────────

function RiskBadge({ level }) {
  const color = riskColor(level)
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
      padding: '0.5rem 1rem', borderRadius: '0.625rem',
      background: color + '12', border: `1.5px solid ${color}35` }}>
      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }}/>
      <div>
        <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: C.n500,
          textTransform: 'uppercase', letterSpacing: '0.07em' }}>Overall Risk</div>
        <div style={{ fontSize: '0.9375rem', fontWeight: 800, color }}>{level}</div>
      </div>
    </div>
  )
}

// ── List Item ──────────────────────────────────────────────────────────────

function ListItem({ text, type }) {
  const cfg = {
    check:  { icon: <IconCheck/>,  color: C.brand500  },
    warn:   { icon: <span style={{ fontSize:'0.875rem', fontWeight:700, color:'#f97316' }}>!</span>, color: '#f97316' },
    step:   { icon: <IconArrow/>, color: '#0ea5e9'   },
  }[type] ?? { icon: <span style={{ fontSize:'0.6rem' }}>●</span>, color: C.n400 }

  return (
    <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start',
      padding: '0.625rem 0.75rem', borderRadius: '0.5rem',
      background: '#f9fafb', marginBottom: '0.5rem' }}>
      <span style={{ flexShrink: 0, marginTop: '0.1rem', color: cfg.color,
        display: 'flex', alignItems: 'center' }}>{cfg.icon}</span>
      <span style={{ fontSize: '0.875rem', color: C.n700, lineHeight: 1.5 }}>{text}</span>
    </div>
  )
}

// ── SWOT Quadrant ──────────────────────────────────────────────────────────

const SWOT_CONFIG = {
  strengths:     { label: 'Strengths',     color: C.brand500, bg: '#edfaf5', borderColor: '#a8e9d1' },
  weaknesses:    { label: 'Weaknesses',    color: '#f97316',  bg: '#fff7ed', borderColor: '#fed7aa' },
  opportunities: { label: 'Opportunities', color: '#0ea5e9',  bg: '#f0f9ff', borderColor: '#bae6fd' },
  threats:       { label: 'Threats',       color: '#8b5cf6',  bg: '#f5f3ff', borderColor: '#ddd6fe' },
}

function SwotQuadrant({ type, text }) {
  const cfg = SWOT_CONFIG[type]
  return (
    <div style={{
      background: cfg.bg,
      border: `1px solid ${cfg.borderColor}`,
      borderRadius: '0.875rem',
      padding: '1.25rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <span style={{ width: '8px', height: '8px', borderRadius: '50%',
          background: cfg.color, flexShrink: 0 }}/>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: cfg.color,
          textTransform: 'uppercase', letterSpacing: '0.08em' }}>{cfg.label}</span>
      </div>
      <p style={{ fontSize: '0.875rem', color: C.n700, lineHeight: 1.7, margin: 0 }}>
        {text || '—'}
      </p>
    </div>
  )
}

// ── Card ───────────────────────────────────────────────────────────────────

function Card({ children, style = {} }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '1rem',
      padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.03)', ...style }}>
      {children}
    </div>
  )
}

// ── Section Title ──────────────────────────────────────────────────────────

function SectionTitle({ icon, children }) {
  return (
    <h2 style={{ fontSize: '1rem', fontWeight: 800, color: C.n900, margin: '0 0 1rem',
      display: 'flex', alignItems: 'center', gap: '0.5rem', letterSpacing: '-0.01em' }}>
      <span style={{ color: C.brand500, display: 'flex', alignItems: 'center' }}>{icon}</span>
      {children}
    </h2>
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function Skeleton({ width = '100%', height = '1rem', radius = '0.375rem', style = {} }) {
  return (
    <div style={{ width, height, borderRadius: radius,
      background: 'linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%)',
      backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite', ...style }}/>
  )
}

// ── Tab Bar ────────────────────────────────────────────────────────────────

function TabBar({ active, onChange, scoringDone, swotDone }) {
  const tabs = [
    { id: 'scoring', label: 'AI Evaluation & Scoring', icon: <IconScore/> },
    { id: 'swot',    label: 'SWOT & Risk Assessment',  icon: <IconChart/> },
  ]
  return (
    <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1.25rem',
      background: '#f3f4f6', borderRadius: '0.75rem', padding: '0.25rem' }}>
      {tabs.map(t => {
        const isActive = active === t.id
        const isLocked = t.id === 'swot' && !swotDone
        return (
          <button key={t.id} onClick={() => !isLocked && onChange(t.id)}
            disabled={isLocked}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '0.5rem', padding: '0.625rem 1rem', borderRadius: '0.5rem', border: 'none',
              background: isActive ? '#fff' : 'transparent',
              color: isActive ? C.n900 : isLocked ? C.n300 : C.n500,
              fontWeight: isActive ? 700 : 500, fontSize: '0.875rem',
              cursor: isLocked ? 'not-allowed' : 'pointer',
              boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s ease', fontFamily: 'inherit' }}>
            <span style={{ display: 'flex', alignItems: 'center',
              color: isActive ? C.brand500 : 'inherit' }}>{t.icon}</span>
            <span>{t.label}</span>
            {t.id === 'swot' && swotDone && (
              <span style={{ width: '6px', height: '6px', borderRadius: '50%',
                background: C.brand500, flexShrink: 0 }}/>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Analyzing State ────────────────────────────────────────────────────────

function AnalyzingState() {
  const steps = [
    { label: 'Scoring the market opportunity',   done: true  },
    { label: 'Evaluating financial viability',   done: true  },
    { label: 'Assessing execution feasibility',  done: false },
    { label: 'Running SWOT analysis',            done: false },
  ]
  return (
    <Card>
      <div style={{ textAlign: 'center', padding: '1rem 0 0.5rem' }}>
        <div style={{ display: 'inline-block', width: '3rem', height: '3rem', borderRadius: '50%',
          border: `3px solid ${C.brand500}20`, borderTopColor: C.brand500,
          animation: 'spin 0.9s linear infinite', marginBottom: '1.25rem' }}/>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: C.n900, margin: '0 0 0.35rem' }}>
          AI is analyzing your idea
        </h3>
        <p style={{ fontSize: '0.875rem', color: C.n500, margin: '0 0 1.75rem', lineHeight: 1.5 }}>
          This takes 15–30 seconds. Running real market analysis for Jordan.
        </p>
        <div style={{ maxWidth: '340px', margin: '0 auto', textAlign: 'left' }}>
          {steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.5rem 0', borderBottom: i < steps.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
              <div style={{ width: '1.25rem', height: '1.25rem', borderRadius: '50%', flexShrink: 0,
                background: step.done ? C.brand500 : '#f3f4f6',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {step.done
                  ? <span style={{ color: '#fff', fontSize: '0.65rem', fontWeight: 700, display:'flex' }}><IconCheck/></span>
                  : <div style={{ width: '8px', height: '8px', borderRadius: '50%',
                      border: `2px solid ${C.n300}`, borderTopColor: C.brand500,
                      animation: 'spin 0.9s linear infinite' }}/>}
              </div>
              <span style={{ fontSize: '0.8125rem', color: step.done ? C.n700 : C.n400,
                fontWeight: step.done ? 500 : 400 }}>{step.label}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '2rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ padding: '0.875rem', background: '#f9fafb', borderRadius: '0.75rem' }}>
              <Skeleton height="0.6rem" width="60%" style={{ marginBottom: '0.75rem' }}/>
              <Skeleton height="1.5rem" width="40%" style={{ marginBottom: '0.5rem' }}/>
              <Skeleton height="0.5rem"/>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

// ── Scoring Tab ────────────────────────────────────────────────────────────

function ScoringTab({ scoring, onViewSwot, swotReady }) {
  const { overallScore, marketScore, financialScore, executionScore, innovationScore,
          verdict, summary, strengths, concerns, recommendations } = scoring
  return (
    <>
      <Card style={{ marginBottom: '1rem' }}>
        <SectionTitle icon={<IconScore/>}>AI Evaluation Score</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1.75rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.625rem' }}>
            <ScoreRing score={overallScore}/>
            <VerdictBadge verdict={verdict}/>
          </div>
          <div>
            <ScoreBar label="Market Opportunity"    score={marketScore}/>
            <ScoreBar label="Financial Viability"   score={financialScore}/>
            <ScoreBar label="Execution Feasibility" score={executionScore}/>
            <ScoreBar label="Innovation / USP"      score={innovationScore}/>
          </div>
        </div>
        {summary && (
          <div style={{ marginTop: '1.25rem', padding: '1rem', background: '#f9fafb',
            borderRadius: '0.75rem', borderLeft: `3px solid ${C.brand500}` }}>
            <p style={{ fontSize: '0.9rem', color: C.n700, lineHeight: 1.65, margin: 0 }}>{summary}</p>
          </div>
        )}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '1rem', marginBottom: '1rem' }}>
        <Card>
          <SectionTitle icon={<IconCheck/>}>Strengths</SectionTitle>
          {(strengths ?? []).map((s, i) => <ListItem key={i} text={s} type="check"/>)}
        </Card>
        <Card>
          <SectionTitle icon={<span style={{ fontSize:'0.75rem', fontWeight:800 }}>!</span>}>Concerns</SectionTitle>
          {(concerns ?? []).map((c, i) => <ListItem key={i} text={c} type="warn"/>)}
        </Card>
        <Card>
          <SectionTitle icon={<IconArrow/>}>Next Steps</SectionTitle>
          {(recommendations ?? []).map((r, i) => <ListItem key={i} text={r} type="step"/>)}
        </Card>
      </div>

      {/* CTA to SWOT tab */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={onViewSwot} disabled={!swotReady}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.75rem 1.375rem', borderRadius: '0.625rem', border: 'none',
            background: swotReady
              ? `linear-gradient(180deg, ${C.brand500} 0%, ${C.brand600} 100%)`
              : '#e5e7eb',
            color: swotReady ? '#fff' : C.n400,
            fontWeight: 700, fontSize: '0.9375rem', fontFamily: 'inherit',
            cursor: swotReady ? 'pointer' : 'not-allowed',
            boxShadow: swotReady ? `0 4px 14px ${C.brand500}35` : 'none',
            transition: 'all 0.15s ease' }}
          onMouseEnter={e => { if (swotReady) e.currentTarget.style.transform = 'translateY(-1px)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}>
          <span>View SWOT & Risk Assessment</span>
          <IconArrow/>
        </button>
      </div>
    </>
  )
}

// ── SWOT Tab ───────────────────────────────────────────────────────────────

function SwotTab({ swot }) {
  const { strengths, weaknesses, opportunities, threats, risks, overallRiskLevel } = swot
  return (
    <>
      <Card style={{ marginBottom: '1rem' }}>
        <SectionTitle icon={<IconChart/>}>SWOT Analysis</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
          <SwotQuadrant type="strengths"     text={strengths}/>
          <SwotQuadrant type="weaknesses"    text={weaknesses}/>
          <SwotQuadrant type="opportunities" text={opportunities}/>
          <SwotQuadrant type="threats"       text={threats}/>
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <SectionTitle icon={<IconShield/>}>Risk Assessment</SectionTitle>
          <RiskBadge level={overallRiskLevel}/>
        </div>
        <p style={{ fontSize: '0.9rem', color: C.n700, lineHeight: 1.7, margin: 0,
          padding: '1rem', background: riskColor(overallRiskLevel) + '08',
          borderRadius: '0.75rem', borderLeft: `3px solid ${riskColor(overallRiskLevel)}40` }}>
          {risks}
        </p>
      </Card>
    </>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function EvaluationPage() {
  const { ideaId } = useParams()
  const navigate   = useNavigate()

  const [phase,    setPhase]    = useState('loading')
  const [scoring,  setScoring]  = useState(null)
  const [swot,     setSwot]     = useState(null)
  const [error,    setError]    = useState(null)
  const [activeTab, setActiveTab] = useState('scoring')

  const pollRef   = useRef(null)
  const mountedRef = useRef(true)

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const applyResults = useCallback((data) => {
    if (!mountedRef.current) return
    if (data.scoring) setScoring(data.scoring)
    if (data.swot)    setSwot(data.swot)
  }, [])

  const checkAndProgress = useCallback(async () => {
    try {
      const data = await getEvaluationResults(ideaId)
      applyResults(data)
      if (data.status === 'completed') { stopPolling(); setPhase('completed') }
      else if (data.status === 'failed') { stopPolling(); setPhase('failed'); setError('The AI evaluation failed. Please try again.') }
    } catch (err) { stopPolling(); setPhase('failed'); setError(err.message) }
  }, [ideaId, applyResults, stopPolling])

  const startPolling = useCallback(() => {
    stopPolling()
    pollRef.current = setInterval(checkAndProgress, POLL_MS)
  }, [checkAndProgress, stopPolling])

  const triggerEvaluation = useCallback(async () => {
    try {
      await startEvaluation(ideaId)
      setPhase('analyzing')
      startPolling()
    } catch (err) { setPhase('failed'); setError(err.message) }
  }, [ideaId, startPolling])

  useEffect(() => {
    mountedRef.current = true
    async function bootstrap() {
      try {
        const data = await getEvaluationResults(ideaId)
        applyResults(data)
        if (data.status === 'completed') setPhase('completed')
        else if (data.status === 'failed') { setPhase('failed'); setError('Evaluation failed. Retry below.') }
        else await triggerEvaluation()
      } catch (err) {
        if (err.status === 404) navigate('/dashboard', { replace: true })
        else { setPhase('failed'); setError(err.message) }
      }
    }
    bootstrap()
    return () => { mountedRef.current = false; stopPolling() }
  }, [ideaId]) // eslint-disable-line

  const handleRetry = () => { setPhase('loading'); setError(null); triggerEvaluation() }

  return (
    <AppLayout>
      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <Link to="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
            fontSize: '0.8125rem', fontWeight: 600, color: C.n500, textDecoration: 'none',
            marginBottom: '0.625rem', transition: 'color 0.15s ease' }}
            onMouseEnter={e => e.currentTarget.style.color = C.brand500}
            onMouseLeave={e => e.currentTarget.style.color = C.n500}>
            ← Back to Dashboard
          </Link>
          <h1 style={{ fontSize: 'clamp(1.375rem, 3vw, 1.75rem)', fontWeight: 800,
            color: C.n900, margin: '0 0 0.25rem', letterSpacing: '-0.02em' }}>
            Idea Evaluation
          </h1>
          <p style={{ fontSize: '0.875rem', color: C.n500, margin: 0 }}>
            AI-powered scoring and SWOT analysis
          </p>
        </div>

        {phase === 'analyzing' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.35rem 0.875rem', borderRadius: '99px',
            background: C.brand500 + '12', border: `1px solid ${C.brand500}30`,
            fontSize: '0.8125rem', fontWeight: 600, color: C.brand500 }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: C.brand500,
              animation: 'spin 1s linear infinite', border: `2px solid ${C.brand500}50`,
              borderTopColor: C.brand500, boxSizing: 'border-box', flexShrink: 0 }}/>
            Analyzing…
          </span>
        )}
        {phase === 'completed' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.35rem 0.875rem', borderRadius: '99px',
            background: '#dcfce7', border: '1px solid #86efac',
            fontSize: '0.8125rem', fontWeight: 600, color: '#15803d' }}>
            <IconCheck/> Complete
          </span>
        )}
        {phase === 'failed' && (
          <span style={{ padding: '0.35rem 0.875rem', borderRadius: '99px',
            background: '#fee2e2', border: '1px solid #fca5a5',
            fontSize: '0.8125rem', fontWeight: 600, color: '#dc2626' }}>
            Failed
          </span>
        )}
      </div>

      {/* Loading skeleton */}
      {phase === 'loading' && (
        <Card>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <Skeleton height="1.75rem" width="50%"/>
            <Skeleton height="1rem" width="30%"/>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.5rem' }}>
              {[1,2,3,4].map(i => <Skeleton key={i} height="5rem" radius="0.75rem"/>)}
            </div>
          </div>
        </Card>
      )}

      {phase === 'analyzing' && <AnalyzingState/>}

      {phase === 'failed' && (
        <Card>
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fee2e2',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1rem', color: '#dc2626' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: C.n900, margin: '0 0 0.5rem' }}>
              Evaluation failed
            </h3>
            <p style={{ fontSize: '0.875rem', color: C.n500, margin: '0 0 1.5rem',
              maxWidth: '360px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.55 }}>
              {error ?? 'Something went wrong during the AI analysis.'}
            </p>
            <button onClick={handleRetry} style={{ padding: '0.75rem 1.5rem', borderRadius: '0.625rem',
              background: `linear-gradient(180deg, ${C.brand500} 0%, ${C.brand600} 100%)`,
              color: '#fff', fontWeight: 700, fontSize: '0.9375rem', border: 'none',
              cursor: 'pointer', boxShadow: `0 4px 14px ${C.brand500}35`, fontFamily: 'inherit' }}>
              Retry Evaluation
            </button>
          </div>
        </Card>
      )}

      {phase === 'completed' && scoring && (
        <div style={{ animation: 'fadeUp 0.4s ease both' }}>
          <TabBar active={activeTab} onChange={setActiveTab}
            scoringDone={!!scoring} swotDone={!!swot}/>
          {activeTab === 'scoring' && (
            <ScoringTab scoring={scoring} swotReady={!!swot}
              onViewSwot={() => setActiveTab('swot')}/>
          )}
          {activeTab === 'swot' && swot && <SwotTab swot={swot}/>}
        </div>
      )}
    </AppLayout>
  )
}