/**
 * FinancialProjectionsPage.jsx
 * Route: /financial-projections/:ideaId
 *
 * 3-step wizard:
 *   Step 1 — Investment Setup  (CapEx + OpEx sliders)
 *   Step 2 — Revenue Model     (Ticket, Customers, Margin, Growth sliders)
 *   Step 3 — Results           (KPI cards + SVG chart + AI insights)
 *
 * - No external chart library — pure SVG
 * - All calculations in frontend
 * - Saves inputs to backend when user reaches Step 3
 * - Reads sector from idea to show correct benchmark banner
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { AppLayout } from '../styles'
import { C } from '../styles/components/DashNavbar'
import { getIdea } from '../services/ideaService'
import { saveFinancialPlan, getFinancialPlan } from '../services/financialService'

// ─── Slider CSS (injected once) ─────────────────────────────────────────────
const SLIDER_CSS = `
  .fp-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 6px;
    border-radius: 99px;
    outline: none;
    cursor: pointer;
  }
  .fp-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #fff;
    border: 2.5px solid #1D9E75;
    box-shadow: 0 1px 4px rgba(29,158,117,0.25), 0 2px 6px rgba(0,0,0,0.06);
    cursor: grab;
    transition: transform 0.12s ease, box-shadow 0.12s ease;
  }
  .fp-slider::-webkit-slider-thumb:hover {
    transform: scale(1.1);
    box-shadow: 0 0 0 6px rgba(29,158,117,0.12);
  }
  .fp-slider::-webkit-slider-thumb:active { cursor: grabbing; }
  .fp-slider::-moz-range-thumb {
    width: 22px; height: 22px;
    border-radius: 50%;
    background: #fff;
    border: 2.5px solid #1D9E75;
    cursor: grab;
  }
  @keyframes fp-fadeup {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes fp-lock-pulse {
    0%, 100% { transform: scale(1); }
    50%       { transform: scale(1.06); }
  }
  .fp-card { animation: fp-fadeup 0.25s ease both; }
`

// ─── Sector benchmark defaults ───────────────────────────────────────────────
const SECTOR_BENCHMARKS = {
  food:      { capex: 15000, opex: 2800, ticket: 8,    customers: 1500, margin: 58, growth: 3,  label: 'Food & Beverage',        hint: 'Jordan F&B cafés — typical 58% beverage margin, 1,500 customers/mo' },
  tech:      { capex: 8000,  opex: 1500, ticket: 49,   customers: 80,   margin: 72, growth: 8,  label: 'Tech & Software',         hint: 'SaaS/app — high margin, lower volume, faster growth' },
  retail:    { capex: 12000, opex: 2200, ticket: 25,   customers: 600,  margin: 40, growth: 4,  label: 'Retail & E-commerce',     hint: 'Jordan retail — 40% gross margin, ~600 customers/mo start' },
  education: { capex: 5000,  opex: 1200, ticket: 35,   customers: 200,  margin: 65, growth: 5,  label: 'Education & Training',    hint: 'Courses/bootcamps — 65% margin, smaller initial cohort' },
  health:    { capex: 18000, opex: 3500, ticket: 20,   customers: 400,  margin: 55, growth: 4,  label: 'Health & Wellness',       hint: 'Clinic/gym — high setup cost, steady monthly volume' },
  services:  { capex: 4000,  opex: 1000, ticket: 60,   customers: 100,  margin: 70, growth: 6,  label: 'Professional Services',   hint: 'Consulting/agency — high ticket, low volume, strong margin' },
  other:     { capex: 10000, opex: 2000, ticket: 20,   customers: 300,  margin: 50, growth: 4,  label: 'General Business',        hint: 'Jordan SME average benchmarks' },
}

// ─── Calculation engine ──────────────────────────────────────────────────────
function computeProjections({ capex, opex, ticket, customers, margin, growth }) {
  const monthly = []
  let cumCash = -capex
  let breakEvenMonth = null

  for (let m = 0; m < 12; m++) {
    const cust    = customers * Math.pow(1 + growth / 100, m)
    const revenue = ticket * cust
    const cogs    = revenue * (1 - margin / 100)
    const cost    = cogs + opex
    const profit  = revenue - cost
    cumCash      += profit
    if (breakEvenMonth === null && cumCash >= 0) breakEvenMonth = m + 1
    monthly.push({ month: m + 1, revenue, cogs, opex, cost, profit, cumCash })
  }

  const year1Revenue = monthly.reduce((s, m) => s + m.revenue, 0)
  const year1Cogs    = monthly.reduce((s, m) => s + m.cogs, 0)
  const year1Opex    = opex * 12
  const year1Profit  = year1Revenue - year1Cogs - year1Opex
  const netAfterCapex = year1Profit - capex
  const roi          = capex > 0 ? (year1Profit / capex) * 100 : 0

  return { monthly, year1Revenue, year1Cogs, year1Opex, year1Profit, netAfterCapex, roi, breakEvenMonth }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n))
const fmtDec = (n, d = 1) => Number(n).toFixed(d)

// ─── Shared UI pieces ────────────────────────────────────────────────────────

function Card({ children, style = {} }) {
  return (
    <div className="fp-card" style={{
      background: '#fff',
      border: `1px solid ${C.n200}`,
      borderRadius: '0.875rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.03)',
      padding: '1.75rem',
      ...style,
    }}>
      {children}
    </div>
  )
}

function SectionTitle({ icon, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '1.25rem' }}>
      <span style={{
        width: 32, height: 32, borderRadius: 8,
        background: C.brand50, color: C.brand600,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{icon}</span>
      <h2 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 700, color: C.n900, letterSpacing: '-0.015em' }}>
        {children}
      </h2>
    </div>
  )
}

function BenchmarkBanner({ sector }) {
  const b = SECTOR_BENCHMARKS[sector] || SECTOR_BENCHMARKS.other
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '0.625rem',
      padding: '0.75rem 0.95rem', marginBottom: '1.5rem',
      background: C.brand50, border: `1px solid ${C.brand200}`,
      borderRadius: '0.625rem', color: C.brand700,
      fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.5,
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
        <path d="M9 18h6"/><path d="M10 22h4"/>
        <path d="M12 2a7 7 0 0 0-4 12.7c.5.4.8 1 .9 1.6L9 18h6l.1-1.7c.1-.6.4-1.2.9-1.6A7 7 0 0 0 12 2Z"/>
      </svg>
      <span>Pre-filled with <strong>{b.label}</strong> benchmarks for Jordan. {b.hint}.</span>
    </div>
  )
}

function Tooltip({ text, children }) {
  const [open, setOpen] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {children}
      {open && (
        <span style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
          transform: 'translateX(-50%)', width: 220,
          padding: '0.625rem 0.75rem', background: C.n900, color: '#fff',
          fontSize: '0.75rem', lineHeight: 1.5, borderRadius: '0.5rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)', pointerEvents: 'none', zIndex: 60,
          textAlign: 'center', whiteSpace: 'normal',
        }}>
          {text}
          <span style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
            borderTop: `5px solid ${C.n900}`,
          }} />
        </span>
      )}
    </span>
  )
}

function SliderRow({ label, tooltip, value, min, max, step, onChange, suffix = 'JOD' }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: C.n900 }}>{label}</span>
          {tooltip && (
            <Tooltip text={tooltip}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"
                style={{ color: C.n400, cursor: 'help' }}>
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
              </svg>
            </Tooltip>
          )}
        </div>
        <span style={{
          padding: '0.3rem 0.75rem', background: C.brand50,
          border: `1px solid ${C.brand200}`, borderRadius: 99,
          color: C.brand700, fontSize: '0.9375rem', fontWeight: 700,
          fontVariantNumeric: 'tabular-nums', flexShrink: 0,
        }}>
          {suffix === '%' || suffix === '' ? `${fmtDec(value, step < 1 ? 1 : 0)}` : fmt(value)}
          {' '}<span style={{ fontSize: '0.6875rem', opacity: 0.75 }}>{suffix}</span>
        </span>
      </div>
      <input
        type="range" className="fp-slider"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          background: `linear-gradient(to right, ${C.brand500} 0%, ${C.brand500} ${pct}%, ${C.n200} ${pct}%, ${C.n200} 100%)`,
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: C.n400, fontWeight: 500 }}>
        <span>{suffix === 'JOD' ? `${fmt(min)} JOD` : `${min}${suffix}`}</span>
        <span>{suffix === 'JOD' ? `${fmt(max)} JOD` : `${max}${suffix}`}</span>
      </div>
    </div>
  )
}

function SummaryBox({ label, value, formula, tone = 'neutral' }) {
  const col = tone === 'positive'
    ? { bg: C.brand50, border: C.brand200, label: C.brand700, val: C.brand700 }
    : { bg: C.n50,     border: C.n200,     label: C.n500,    val: C.n900 }
  return (
    <div style={{
      background: col.bg, border: `1px solid ${col.border}`,
      borderRadius: '0.625rem', padding: '1rem 1.125rem',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '1rem', flexWrap: 'wrap',
    }}>
      <div>
        <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: col.label, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
          {label}
        </div>
        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: col.val, letterSpacing: '-0.02em', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
          {fmt(value)} <span style={{ fontSize: '0.875rem', fontWeight: 700, opacity: 0.65 }}>JOD</span>
        </div>
      </div>
      {formula && (
        <div style={{
          fontSize: '0.8125rem', color: C.n500, fontWeight: 500,
          fontFamily: 'monospace', background: '#fff',
          padding: '0.5rem 0.75rem', borderRadius: '0.5rem',
          border: `1px dashed ${col.border}`, fontVariantNumeric: 'tabular-nums',
        }}>{formula}</div>
      )}
    </div>
  )
}

function BtnPrimary({ children, onClick, disabled }) {
  const [hov, setHov] = useState(false)
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.75rem 1.5rem', borderRadius: '0.5rem', border: 'none',
        background: disabled ? C.n200 : C.brand500,
        color: disabled ? C.n400 : '#fff',
        fontSize: '0.9375rem', fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: hov && !disabled ? '0 0 0 3px rgba(29,158,117,0.25), 0 6px 16px rgba(29,158,117,0.28)' : '0 2px 6px rgba(29,158,117,0.2)',
        transform: hov && !disabled ? 'translateY(-1px)' : 'none',
        transition: 'all 0.15s ease', letterSpacing: '-0.005em',
      }}>
      {children}
    </button>
  )
}

function BtnSecondary({ children, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button type="button" onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
        padding: '0.75rem 1.25rem', borderRadius: '0.5rem',
        background: '#fff', color: C.n700,
        border: `1px solid ${hov ? C.n300 : C.n200}`,
        fontSize: '0.9375rem', fontWeight: 600,
        cursor: 'pointer', transition: 'all 0.15s ease',
      }}>
      {children}
    </button>
  )
}

// ─── Progress Steps ───────────────────────────────────────────────────────────
const STEPS = [
  { label: 'Investment Setup', hint: 'Costs & capital' },
  { label: 'Revenue Model',    hint: 'Pricing & sales' },
  { label: 'Results',          hint: 'Your projections' },
]

function ProgressBar({ current }) {
  return (
    <ol style={{ display: 'flex', alignItems: 'flex-start', listStyle: 'none', margin: 0, padding: 0 }}>
      {STEPS.map((s, i) => {
        const done    = i < current
        const active  = i === current
        const isLast  = i === STEPS.length - 1
        return (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', flex: isLast ? '0 0 auto' : '1 1 0', minWidth: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 14,
                background: done || active ? C.brand500 : '#fff',
                color: done || active ? '#fff' : C.n400,
                border: done || active ? 'none' : `2px solid ${C.n200}`,
                boxShadow: active ? `0 0 0 4px ${C.brand100}` : done ? `0 0 0 4px ${C.brand50}` : 'none',
                transition: 'all 0.3s ease',
              }}>
                {done
                  ? <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M12.78 4.22a.75.75 0 010 1.06l-5.5 5.5a.75.75 0 01-1.06 0l-2.5-2.5a.75.75 0 011.06-1.06L6.75 9.19l4.97-4.97a.75.75 0 011.06 0z"/></svg>
                  : i + 1
                }
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: active || done ? 700 : 500, color: active || done ? C.n900 : C.n400, whiteSpace: 'nowrap' }}>{s.label}</div>
                <div style={{ fontSize: '0.6875rem', color: C.n400, marginTop: 2, whiteSpace: 'nowrap' }}>{s.hint}</div>
              </div>
            </div>
            {!isLast && (
              <div style={{
                flex: 1, height: 2, margin: '17px 0.75rem 0',
                background: done ? C.brand400 : C.n200,
                borderRadius: 99, transition: 'background 0.3s ease',
              }} />
            )}
          </li>
        )
      })}
    </ol>
  )
}

// ─── Step 1 — Investment Setup ────────────────────────────────────────────────
function Step1({ sector, capex, opex, setCapex, setOpex, onNext }) {
  return (
    <Card>
      <SectionTitle icon={
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/>
          <line x1="6" y1="20" x2="6" y2="14"/><line x1="3" y1="20" x2="21" y2="20"/>
        </svg>
      }>Investment Setup</SectionTitle>

      <BenchmarkBanner sector={sector} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', marginBottom: '1.75rem' }}>
        <SliderRow
          label="Initial Investment (CapEx)"
          tooltip="One-time startup costs — equipment, licenses, fit-out, deposits."
          value={capex} min={1000} max={100000} step={500}
          onChange={setCapex}
        />
        <SliderRow
          label="Monthly Operating Expenses (OpEx)"
          tooltip="Recurring monthly costs — rent, salaries, utilities, supplies."
          value={opex} min={500} max={20000} step={100}
          onChange={setOpex}
        />
      </div>

      <SummaryBox
        label="Year 1 Total Fixed Cost"
        value={capex + opex * 12}
        formula={`${fmt(capex)} + (${fmt(opex)} × 12)`}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.75rem' }}>
        <BtnPrimary onClick={onNext}>
          Next: Revenue Model
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </BtnPrimary>
      </div>
    </Card>
  )
}

// ─── Step 2 — Revenue Model ───────────────────────────────────────────────────
function Step2({ sector, ticket, customers, margin, growth, setTicket, setCustomers, setMargin, setGrowth, onBack, onNext }) {
  const monthlyRevenue = ticket * customers
  const monthlyGross   = monthlyRevenue * (margin / 100)
  const annualRevenue  = monthlyRevenue * 12

  return (
    <Card>
      <SectionTitle icon={
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23"/>
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
      }>Revenue Model</SectionTitle>

      <BenchmarkBanner sector={sector} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem 2rem', marginBottom: '1.75rem' }}>
        <SliderRow label="Average Ticket Size" tooltip="Average JOD spent per customer per visit." value={ticket} min={1} max={50} step={0.5} onChange={setTicket} />
        <SliderRow label="Customers per Month" tooltip="Expected paying customers in your first month." value={customers} min={100} max={10000} step={50} suffix="" onChange={setCustomers} />
        <SliderRow label="Gross Margin" tooltip="What's left from each JOD after direct costs." value={margin} min={20} max={90} step={1} suffix="%" onChange={setMargin} />
        <SliderRow label="Monthly Growth Rate" tooltip="Month-over-month customer volume growth." value={growth} min={0} max={15} step={0.5} suffix="%" onChange={setGrowth} />
      </div>

      {/* Live mini-cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Monthly Revenue', value: `${fmt(monthlyRevenue)} JOD`, hint: `${fmtDec(ticket, 1)} × ${fmt(customers)}` },
          { label: 'Monthly Gross',   value: `${fmt(monthlyGross)} JOD`,   hint: `${margin}% margin` },
          { label: 'Annual Revenue',  value: `${fmt(annualRevenue)} JOD`,  hint: 'base, before growth' },
        ].map((k, i) => (
          <div key={i} style={{ padding: '0.875rem 1rem', background: C.n50, border: `1px solid ${C.n200}`, borderRadius: '0.625rem' }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: C.n500, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{k.label}</div>
            <div style={{ fontSize: '1.125rem', fontWeight: 800, color: C.n900, letterSpacing: '-0.01em', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            <div style={{ fontSize: '0.6875rem', color: C.n400, marginTop: 2, fontWeight: 500 }}>{k.hint}</div>
          </div>
        ))}
      </div>

      <SummaryBox
        label="Projected Year 1 Gross Profit"
        value={annualRevenue * (margin / 100)}
        formula={`${fmt(annualRevenue)} × ${margin}%`}
        tone="positive"
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginTop: '1.75rem' }}>
        <BtnSecondary onClick={onBack}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Back
        </BtnSecondary>
        <BtnPrimary onClick={onNext}>
          Generate Projections
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </BtnPrimary>
      </div>
    </Card>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, hint, accentColor }) {
  return (
    <div style={{
      padding: '1.25rem 1.375rem', background: '#fff',
      border: `1px solid ${C.n200}`, borderRadius: '0.875rem',
      borderLeft: `3px solid ${accentColor}`,
      display: 'flex', flexDirection: 'column', gap: '0.4rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: C.n500, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: C.n900, letterSpacing: '-0.022em', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 600, color: accentColor }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: accentColor, flexShrink: 0 }} />
        {hint}
      </div>
    </div>
  )
}

// ─── SVG Chart ────────────────────────────────────────────────────────────────
function MonthlyChart({ monthly, breakEvenMonth }) {
  const W = 760, H = 280
  const padL = 56, padR = 24, padT = 28, padB = 36
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  const maxVal = Math.max(...monthly.map(m => Math.max(m.revenue, m.cost))) * 1.15 || 1
  const minCum = Math.min(0, ...monthly.map(m => m.cumCash))
  const maxCum = Math.max(0, ...monthly.map(m => m.cumCash))
  const cumRange = (maxCum - minCum) || 1

  const xPos   = i  => padL + (i + 0.5) * (innerW / 12)
  const yVal   = v  => padT + innerH * (1 - Math.max(0, v) / maxVal)
  const yCum   = v  => padT + innerH * (1 - (v - minCum) / cumRange)
  const barW   = (innerW / 12) * 0.3

  const linePath = monthly
    .map((m, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i)} ${yCum(m.cumCash)}`)
    .join(' ')

  return (
    <div style={{ background: '#fff', border: `1px solid ${C.n200}`, borderRadius: '0.875rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: C.n900 }}>Year 1 — Monthly P&L</h3>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.8125rem', color: C.n500 }}>Revenue vs. costs · cumulative cash flow</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', fontSize: '0.75rem', fontWeight: 600, color: C.n500 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: C.brand500 }} />Revenue
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: C.n300 }} />Costs
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 2, background: '#0ea5e9', borderRadius: 99 }} />Cash flow
          </span>
        </div>
      </div>

      <div style={{ width: '100%', overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', minWidth: 520 }}>
          {/* Gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
            <line key={i} x1={padL} x2={W - padR} y1={padT + innerH * f} y2={padT + innerH * f}
              stroke={i === 4 ? C.n300 : C.n100} strokeWidth={1} />
          ))}

          {/* Y-axis labels */}
          {[0, 0.5, 1].map(f => {
            const v = maxVal * (1 - f)
            return (
              <text key={f} x={padL - 8} y={padT + innerH * f + 4}
                textAnchor="end" fontSize="10" fontWeight="600" fill={C.n400} fontFamily="Inter">
                {v >= 1000 ? `${(v / 1000).toFixed(0)}k` : fmt(v)}
              </text>
            )
          })}

          {/* Break-even line */}
          {breakEvenMonth && breakEvenMonth <= 12 && (
            <g>
              <line x1={xPos(breakEvenMonth - 1)} x2={xPos(breakEvenMonth - 1)}
                y1={padT} y2={padT + innerH}
                stroke={C.brand500} strokeWidth={1.5} strokeDasharray="4 4" opacity={0.6} />
              <rect x={xPos(breakEvenMonth - 1) - 32} y={padT + 4} width={64} height={18} rx={9}
                fill={C.brand50} stroke={C.brand200} />
              <text x={xPos(breakEvenMonth - 1)} y={padT + 16} textAnchor="middle"
                fontSize="10" fontWeight="700" fill={C.brand700} fontFamily="Inter">
                Break-even
              </text>
            </g>
          )}

          {/* Bars */}
          {monthly.map((m, i) => (
            <g key={i}>
              <rect x={xPos(i) - barW - 1} y={yVal(m.cost)}
                width={barW} height={padT + innerH - yVal(m.cost)} rx={3} fill={C.n200} />
              <rect x={xPos(i) + 1} y={yVal(m.revenue)}
                width={barW} height={padT + innerH - yVal(m.revenue)} rx={3} fill={C.brand500} opacity={0.9} />
              <text x={xPos(i)} y={H - padB + 18} textAnchor="middle"
                fontSize="10" fontWeight="600" fill={C.n500} fontFamily="Inter">
                {labels[i]}
              </text>
            </g>
          ))}

          {/* Cumulative cash line */}
          <path d={linePath} fill="none" stroke="#0ea5e9" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          {monthly.map((m, i) => (
            <circle key={i} cx={xPos(i)} cy={yCum(m.cumCash)} r={3} fill="#fff" stroke="#0ea5e9" strokeWidth={2} />
          ))}
        </svg>
      </div>
    </div>
  )
}

// ─── AI Insights ─────────────────────────────────────────────────────────────
function buildInsights({ projections, capex, opex, margin }) {
  const { breakEvenMonth, roi, year1Profit, year1Revenue } = projections
  const insights = []

  // 1. Break-even
  if (!breakEvenMonth) {
    insights.push({ tone: 'warn', title: 'No break-even in Year 1', body: `Cumulative cash flow doesn't recover your ${fmt(capex)} JOD investment in 12 months. Try increasing ticket size, customer volume, or trimming OpEx.` })
  } else if (breakEvenMonth <= 6) {
    insights.push({ tone: 'positive', title: `Fast payback — Month ${breakEvenMonth}`, body: `You recover your ${fmt(capex)} JOD investment in under 6 months. A strong signal for early profitability.` })
  } else {
    insights.push({ tone: 'info', title: `Break-even at Month ${breakEvenMonth}`, body: `Your cumulative cash crosses zero at month ${breakEvenMonth}. This is healthy for a Year 1 launch in Jordan.` })
  }

  // 2. ROI
  if (roi >= 100) {
    insights.push({ tone: 'positive', title: `${Math.round(roi)}% ROI — Strong`, body: `Operating profit of ${fmt(year1Profit)} JOD against ${fmt(capex)} JOD invested. Well above the 30–50% Jordan SME benchmark.` })
  } else if (roi >= 30) {
    insights.push({ tone: 'info', title: `${Math.round(roi)}% ROI — On track`, body: `Within the typical 30–50% range for Jordan SME startups. Modest price or volume increases can push this higher.` })
  } else if (roi > 0) {
    insights.push({ tone: 'warn', title: `${Math.round(roi)}% ROI — Below benchmark`, body: `Returns are below the Jordan SME benchmark of 30%. Consider revisiting pricing or fixed costs.` })
  } else {
    insights.push({ tone: 'warn', title: 'Operating loss projected', body: `Year 1 ends with a loss of ${fmt(Math.abs(year1Profit))} JOD. Re-examine pricing or cut fixed costs before launching.` })
  }

  // 3. Unit economics
  const opexShare = year1Revenue > 0 ? ((opex * 12) / year1Revenue) * 100 : 0
  if (opexShare > 40) {
    insights.push({ tone: 'warn', title: 'OpEx is heavy vs. revenue', body: `Fixed monthly costs represent ${opexShare.toFixed(0)}% of annual revenue. Healthy businesses in Jordan stay below 40%.` })
  } else if (margin < 50) {
    insights.push({ tone: 'info', title: 'Gross margin below sector average', body: `Your ${margin}% gross margin trails the sector benchmark of 55–65%. Negotiate supplier terms or revisit pricing.` })
  } else {
    insights.push({ tone: 'positive', title: 'Healthy unit economics', body: `${margin}% gross margin with OpEx at ${opexShare.toFixed(0)}% of revenue — your unit economics look solid.` })
  }

  return insights
}

function InsightCard({ tone, title, body }) {
  const cfg = {
    positive: { bg: C.brand50,  border: C.brand200, dot: C.brand500, tag: 'Strength'    },
    info:     { bg: '#f0f9ff',  border: '#bae6fd',  dot: '#0ea5e9',  tag: 'Observation' },
    warn:     { bg: '#fff7ed',  border: '#fed7aa',  dot: '#f97316',  tag: 'Watch out'   },
  }[tone]
  return (
    <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: '0.75rem', padding: '1rem 1.125rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
        <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: cfg.dot, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{cfg.tag}</span>
      </div>
      <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.n900, letterSpacing: '-0.005em', lineHeight: 1.3 }}>{title}</div>
      <div style={{ fontSize: '0.8125rem', color: C.n600, lineHeight: 1.55 }}>{body}</div>
    </div>
  )
}

// ─── Step 3 — Results ─────────────────────────────────────────────────────────
function Step3({ inputs, projections, onBack }) {
  const insights  = useMemo(() => buildInsights({ projections, ...inputs }), [projections, inputs])
  const verdict   = projections.roi >= 100 ? 'Strong' : projections.roi >= 30 ? 'Promising' : projections.roi > 0 ? 'Marginal' : 'High Risk'
  const vColor    = projections.roi >= 30 ? C.brand500 : projections.roi > 0 ? '#f59e0b' : '#ef4444'

  return (
    <>
      {/* KPI header card */}
      <Card style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <span style={{ width: 32, height: 32, borderRadius: 8, background: C.brand50, color: C.brand600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </span>
            <h2 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 700, color: C.n900 }}>Your Year 1 Projections</h2>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.75rem', background: vColor + '18', border: `1px solid ${vColor}40`, borderRadius: 99, color: vColor, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: vColor }} />
            {verdict}
          </span>
        </div>

        {/* 4 KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <KpiCard label="Year 1 Revenue"      value={`${fmt(projections.year1Revenue)} JOD`}  hint={`${fmt(projections.year1Revenue / 12)} JOD/mo avg`}          accentColor={C.brand500} />
          <KpiCard label="Net Operating Profit" value={`${fmt(projections.year1Profit)} JOD`}  hint={projections.year1Profit >= 0 ? 'Before capex recovery' : 'Year 1 loss'} accentColor={projections.year1Profit >= 0 ? C.brand500 : '#f59e0b'} />
          <KpiCard label="Break-Even Month"    value={projections.breakEvenMonth ? `Month ${projections.breakEvenMonth}` : 'After Year 1'} hint={projections.breakEvenMonth ? 'Capex recovered' : 'Re-examine inputs'} accentColor={projections.breakEvenMonth ? '#0ea5e9' : '#f59e0b'} />
          <KpiCard label="ROI"                  value={`${Math.round(projections.roi)}%`}       hint={projections.roi >= 30 ? 'Above benchmark' : projections.roi > 0 ? 'Below benchmark' : 'Loss'} accentColor={projections.roi >= 30 ? C.brand500 : '#f59e0b'} />
        </div>

        {/* Secondary breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem', padding: '0.875rem 1rem', background: C.n50, border: `1px solid ${C.n200}`, borderRadius: '0.625rem' }}>
          {[
            { l: 'Cost of Goods',       v: projections.year1Cogs    },
            { l: 'Operating Expenses',  v: projections.year1Opex    },
            { l: 'Capital Expense',     v: inputs.capex             },
            { l: 'Net After Capex',     v: projections.netAfterCapex },
          ].map((row, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: C.n500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{row.l}</span>
              <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: row.v < 0 ? '#dc2626' : C.n900, fontVariantNumeric: 'tabular-nums' }}>
                {fmt(row.v)} <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: C.n400 }}>JOD</span>
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Chart */}
      <div style={{ marginBottom: '1rem' }}>
        <MonthlyChart monthly={projections.monthly} breakEvenMonth={projections.breakEvenMonth} />
      </div>

      {/* Insights */}
      <Card style={{ marginBottom: '1rem' }}>
        <SectionTitle icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.9 5.7L19.5 10l-5.6 1.9L12 17l-1.9-5.6L4.5 10l5.6-1.9L12 3z"/>
          </svg>
        }>AI Insights & Recommendations</SectionTitle>
        <div style={{ display: 'grid', gap: '0.625rem' }}>
          {insights.map((ins, i) => <InsightCard key={i} {...ins} />)}
        </div>
      </Card>

      {/* Footer actions */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', gap: '0.625rem', flexWrap: 'wrap',
        background: '#fff', border: `1px solid ${C.n200}`, borderRadius: '0.875rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)', padding: '1rem 1.25rem',
      }}>
        <BtnSecondary onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Adjust Inputs
        </BtnSecondary>
        <BtnPrimary onClick={() => window.print()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export PDF
        </BtnPrimary>
      </div>
    </>
  )
}

// ─── Locked preview (shown during Steps 1 & 2) ───────────────────────────────
function LockedPreview({ stepsRemaining }) {
  return (
    <div style={{ marginTop: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.875rem' }}>
        <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: C.n400, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Coming Next</span>
        <div style={{ flex: 1, height: 1, background: C.n200 }} />
      </div>
      <div style={{ background: '#fff', border: `1px solid ${C.n200}`, borderRadius: '0.875rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', position: 'relative', overflow: 'hidden' }}>
        {/* Blurred KPI cards */}
        <div style={{ filter: 'blur(5px)', pointerEvents: 'none' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '0.875rem' }}>
            {['Year 1 Revenue', 'Net Profit', 'Break-Even', 'ROI %'].map((l, i) => (
              <div key={i} style={{ padding: '1rem', background: C.n50, border: `1px solid ${C.n200}`, borderRadius: '0.75rem' }}>
                <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: C.n400, textTransform: 'uppercase', marginBottom: 6 }}>{l}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: C.n300 }}>••••••</div>
              </div>
            ))}
          </div>
          {/* Chart skeleton */}
          <div style={{ background: C.n50, border: `1px solid ${C.n200}`, borderRadius: '0.75rem', padding: '1.25rem', height: 120, display: 'flex', alignItems: 'flex-end', gap: '0.3rem' }}>
            {[22, 30, 38, 45, 52, 58, 64, 70, 75, 82, 88, 94].map((h, i) => (
              <div key={i} style={{ flex: 1, height: `${h}%`, background: C.n200, borderRadius: '3px 3px 0 0' }} />
            ))}
          </div>
        </div>
        {/* Lock overlay */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.75rem', background: 'radial-gradient(ellipse at center, rgba(249,250,251,0.85) 0%, rgba(249,250,251,0.6) 100%)' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#fff', border: `1px solid ${C.n200}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.n400, boxShadow: '0 6px 20px rgba(0,0,0,0.06)', animation: 'fp-lock-pulse 2.4s ease-in-out infinite' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.n700 }}>Complete the setup to unlock your projections</div>
            <div style={{ fontSize: '0.8125rem', color: C.n500, marginTop: 4 }}>{stepsRemaining} step{stepsRemaining !== 1 ? 's' : ''} remaining</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function FinancialProjectionsPage() {
  const { ideaId } = useParams()
  const navigate   = useNavigate()

  const [idea,    setIdea]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [stepIdx, setStepIdx] = useState(0)
  const [saving,  setSaving]  = useState(false)

  // Get sector to pick defaults
  const sector = idea?.sector || 'other'
  const bench  = SECTOR_BENCHMARKS[sector] || SECTOR_BENCHMARKS.other

  // Slider state — initialised from benchmarks
  const [capex,     setCapex]     = useState(bench.capex)
  const [opex,      setOpex]      = useState(bench.opex)
  const [ticket,    setTicket]    = useState(bench.ticket)
  const [customers, setCustomers] = useState(bench.customers)
  const [margin,    setMargin]    = useState(bench.margin)
  const [growth,    setGrowth]    = useState(bench.growth)

  // Load idea (for sector + title) and any saved plan
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const ideaData = await getIdea(ideaId)
        if (cancelled) return
        setIdea(ideaData)

        // Try to load saved plan inputs
        try {
          const plan = await getFinancialPlan(ideaId)
          if (!cancelled && plan) {
            if (plan.initialInvestment) setCapex(plan.initialInvestment)
            if (plan.monthlyCosts)      setOpex(plan.monthlyCosts)
            if (plan.grossMarginPct)    setMargin(plan.grossMarginPct)
          }
        } catch (_) { /* no saved plan — use benchmarks */ }

        // Reset sliders to sector benchmarks if no saved plan
        const b = SECTOR_BENCHMARKS[ideaData.sector] || SECTOR_BENCHMARKS.other
        setCapex(c => c === bench.capex ? b.capex : c)
        setOpex(o => o === bench.opex ? b.opex : o)
        setTicket(t => t === bench.ticket ? b.ticket : t)
        setCustomers(cu => cu === bench.customers ? b.customers : cu)
        setMargin(m => m === bench.margin ? b.margin : m)
        setGrowth(g => g === bench.growth ? b.growth : g)
      } catch (_) {
        if (!cancelled) navigate('/dashboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [ideaId])

  const inputs = { capex, opex, ticket, customers, margin, growth }
  const projections = useMemo(() => computeProjections(inputs), [capex, opex, ticket, customers, margin, growth])

  const goNext = useCallback(async () => {
    const next = stepIdx + 1
    setStepIdx(next)
    // Save to backend when reaching Results
    if (next === 2) {
      setSaving(true)
      try { await saveFinancialPlan(ideaId, inputs) } catch (_) { /* silent — don't block the user */ }
      finally { setSaving(false) }
    }
  }, [stepIdx, ideaId, inputs])

  const goBack = () => setStepIdx(i => Math.max(0, i - 1))

  if (loading) {
    return (
      <AppLayout>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ animation: 'fp-fadeup 1s linear infinite', color: C.brand500 }}>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.2"/>
            <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
          </svg>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      {/* Inject slider CSS once */}
      <style>{SLIDER_CSS}</style>

      {/* Breadcrumb + title */}
      <header style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', fontSize: '0.8125rem', color: C.n500, fontWeight: 500, marginBottom: '0.625rem' }}>
          <Link to="/dashboard" style={{ color: C.n500, textDecoration: 'none' }}>Dashboard</Link>
          <span style={{ color: C.n300 }}>/</span>
          <Link to={`/evaluation/${ideaId}`} style={{ color: C.n500, textDecoration: 'none' }}>{idea?.title || 'Idea'}</Link>
          <span style={{ color: C.n300 }}>/</span>
          <span style={{ color: C.n700, fontWeight: 600 }}>Financials</span>
        </div>

        <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.875rem', fontWeight: 800, color: C.n900, letterSpacing: '-0.025em', lineHeight: 1.15 }}>
          Financial Projections
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
          <p style={{ margin: 0, fontSize: '0.9375rem', color: C.n500, fontWeight: 500 }}>
            {SECTOR_BENCHMARKS[sector]?.label || 'Business'}
            <span style={{ color: C.n300, margin: '0 0.4rem' }}>·</span>
            Idea: <span style={{ color: C.n700, fontWeight: 600 }}>{idea?.title}</span>
          </p>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.25rem 0.7rem', background: C.brand50, border: `1px solid ${C.brand200}`, borderRadius: 99, fontSize: '0.75rem', fontWeight: 700, color: C.brand700 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.brand500 }} />
            {SECTOR_BENCHMARKS[sector]?.label || 'General'}
          </span>
        </div>
      </header>

      {/* Progress bar */}
      <div style={{ background: '#fff', border: `1px solid ${C.n200}`, borderRadius: '0.875rem', padding: '1.5rem 1.75rem', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <ProgressBar current={stepIdx} />
      </div>

      {/* Active step */}
      {stepIdx === 0 && (
        <Step1 sector={sector} capex={capex} opex={opex} setCapex={setCapex} setOpex={setOpex} onNext={goNext} />
      )}
      {stepIdx === 1 && (
        <Step2 sector={sector} ticket={ticket} customers={customers} margin={margin} growth={growth}
          setTicket={setTicket} setCustomers={setCustomers} setMargin={setMargin} setGrowth={setGrowth}
          onBack={goBack} onNext={goNext} />
      )}
      {stepIdx === 2 && (
        <Step3 inputs={inputs} projections={projections} onBack={goBack} />
      )}

      {/* Locked preview while not on Results */}
      {stepIdx < 2 && <LockedPreview stepsRemaining={2 - stepIdx} />}
    </AppLayout>
  )
}
