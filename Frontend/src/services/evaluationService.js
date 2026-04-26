/**
 * evaluationService.js — Evaluation API calls
 * ──────────────────────────────────────────────────────────────────────────
 * Two endpoints on EvaluationController:
 *
 *   POST /api/evaluation/{ideaId}/start
 *     → 202 Accepted — kicks off background evaluation
 *     → 200 OK       — already completed
 *     → 202 Accepted — already in progress
 *
 *   GET /api/evaluation/{ideaId}/results
 *     → { ideaId, status, scoring, swot }
 *       status: "submitted" | "analyzing" | "completed" | "failed"
 *       scoring: null if not yet done
 *       swot:    null if not yet done
 */

import api from './api'

const BASE = '/api/evaluation'

/**
 * Fire the evaluation. Backend returns 202 immediately,
 * evaluation runs in background. Poll getResults() to track progress.
 *
 * @param {string} ideaId
 * @returns {Promise<{ message: string, ideaId: string, status: string }>}
 */
export async function startEvaluation(ideaId) {
  return api.post(`${BASE}/${encodeURIComponent(ideaId)}/start`, { auth: true })
}

/**
 * Poll this after startEvaluation(). Returns partial data while analyzing,
 * full data when status === "completed".
 *
 * @param {string} ideaId
 * @returns {Promise<EvaluationResult>}
 */
export async function getEvaluationResults(ideaId) {
  return api.get(`${BASE}/${encodeURIComponent(ideaId)}/results`, { auth: true })
}

/**
 * @typedef {Object} EvaluationResult
 * @property {string} ideaId
 * @property {'submitted'|'analyzing'|'completed'|'failed'} status
 * @property {ScoringResult|null} scoring
 * @property {SwotResult|null} swot
 *
 * @typedef {Object} ScoringResult
 * @property {number} overallScore
 * @property {number} marketScore
 * @property {number} financialScore
 * @property {number} executionScore
 * @property {number} innovationScore
 * @property {string} verdict
 * @property {string} summary
 * @property {string[]} strengths
 * @property {string[]} concerns
 * @property {string[]} recommendations
 *
 * @typedef {Object} SwotResult
 * @property {string} strengths
 * @property {string} weaknesses
 * @property {string} opportunities
 * @property {string} threats
 * @property {string} risks
 * @property {'Low'|'Medium'|'High'|'Critical'} overallRiskLevel
 */