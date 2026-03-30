namespace Mashroo3i.Models
{
    public class Evaluation
    {
        public Guid EvaluationId { get; set; } = Guid.NewGuid();
        public Guid IdeaId { get; set; }

        public int NoveltyScore { get; set; }
        public int MarketPotentialScore { get; set; }
        public int OverallScore { get; set; }

        public string RiskLevel { get; set; } = string.Empty;
        public string Strengths { get; set; } = string.Empty;
        public string Weaknesses { get; set; } = string.Empty;
        public string Opportunities { get; set; } = string.Empty;
        public string Threats { get; set; } = string.Empty;
        public string? Recommendations { get; set; }
        public string? Verdict { get; set; }
        public string? RedFlags { get; set; }

        public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;

        public BusinessIdea BusinessIdea { get; set; } = null!;
    }
}