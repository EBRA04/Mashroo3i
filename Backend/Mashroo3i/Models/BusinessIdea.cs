namespace Mashroo3i.Models
{
    public class BusinessIdea
    {
        public Guid IdeaId { get; set; } = Guid.NewGuid();
        public Guid UserId { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string? ProblemStatement { get; set; }
        public string? TargetAudience { get; set; }
        public string? Usp { get; set; }
        public string BusinessType { get; set; } = "B2C";
        public string Sector { get; set; } = "other";
        public string AmmanRegion { get; set; } = "central";
        public string? BusinessTypeReason { get; set; }
        public decimal EstimatedBudget { get; set; }
        public string Status { get; set; } = "submitted";
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public User User { get; set; } = null!;
        public Evaluation? Evaluation { get; set; }
        public MarketAnalysis? MarketAnalysis { get; set; }
        public FinancialPlan? FinancialPlan { get; set; }

        public const string StatusSubmitted = "submitted";
        public const string StatusAnalyzing = "analyzing";
        public const string StatusCompleted = "completed";
    }
}