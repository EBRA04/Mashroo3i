namespace Mashroo3i.Models
{
    public class FinancialProjection
    {
        public Guid PlanId { get; set; } = Guid.NewGuid();
        public Guid IdeaId { get; set; }

        // All 6 slider inputs — stored so user returns to exact same state
        public decimal InitialInvestment  { get; set; }  // CapEx
        public decimal MonthlyCosts       { get; set; }  // OpEx
        public decimal TicketSize         { get; set; }  // avg ticket JOD
        public decimal CustomersPerMonth  { get; set; }  // starting customers/month
        public decimal GrossMarginPct     { get; set; }  // margin %
        public decimal MonthlyGrowthRate  { get; set; }  // growth % per month

        // Kept for backward compat
        public decimal MonthlyRevenue     { get; set; }
        public int     BreakEvenMonths    { get; set; }
        public decimal RoiPercentage      { get; set; }
        public decimal MonthlyProfit      { get; set; }
        public decimal BreakEvenUnits     { get; set; }
        public decimal? LTV               { get; set; }
        public decimal? CAC               { get; set; }
        public decimal? LtvCacRatio       { get; set; }
        public decimal? ARR               { get; set; }
        public string? FinancialSummary   { get; set; }
        public DateTime CreatedAt         { get; set; } = DateTime.UtcNow;

        public BusinessIdea BusinessIdea  { get; set; } = null!;
    }
}
