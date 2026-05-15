import api from './api'

const BASE = '/api/financial-plans'

export async function getFinancialPlan(ideaId) {
  return api.get(`${BASE}/${ideaId}`, { auth: true })
}

export async function saveFinancialPlan(ideaId, inputs) {
  return api.post(`${BASE}/${ideaId}`, {
    auth: true,
    body: {
      capEx:             inputs.capex,
      opEx:              inputs.opex,
      ticketSize:        inputs.ticket,
      customersPerMonth: inputs.customers,
      grossMargin:       inputs.margin,
      monthlyGrowth:     inputs.growth,
    },
  })
}
