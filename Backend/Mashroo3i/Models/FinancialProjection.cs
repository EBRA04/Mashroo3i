namespace Mashroo3i.Models
{
    public class FinancialProjection
    {
        public Guid PlanId { get; set; } = Guid.NewGuid();
        public Guid IdeaId { get; set; }

        // User inputs
        public decimal InitialInvestment { get; set; }
        public decimal MonthlyRevenue { get; set; }
        public decimal MonthlyCosts { get; set; }

        // Calculated outputs
        public int BreakEvenMonths { get; set; }
        public decimal RoiPercentage { get; set; }
        public decimal MonthlyProfit { get; set; }
        public decimal GrossMarginPct { get; set; }
        public decimal BreakEvenUnits { get; set; }

        // Optional SaaS metrics
        public decimal? LTV { get; set; }
        public decimal? CAC { get; set; }
        public decimal? LtvCacRatio { get; set; }
        public decimal? ARR { get; set; }

        public string? FinancialSummary { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public BusinessIdea BusinessIdea { get; set; } = null!;
    }
}