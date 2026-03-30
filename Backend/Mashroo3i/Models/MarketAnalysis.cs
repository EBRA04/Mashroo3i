namespace Mashroo3i.Models
{
    public class MarketAnalysis
    {
        public Guid MarketAnalysisId { get; set; } = Guid.NewGuid();
        public Guid IdeaId { get; set; }

        // User inputs
        public string BusinessType { get; set; } = string.Empty;
        public string AmmanRegion { get; set; } = "central";

        // AI generated outputs
        public string CompetitorInsights { get; set; } = string.Empty;
        public string IndustryCostBenchmarks { get; set; } = string.Empty;
        public string MarketTrends { get; set; } = string.Empty;
        public string MarketSize { get; set; } = string.Empty;
        public string? Recommendations { get; set; }

        public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;

        public BusinessIdea BusinessIdea { get; set; } = null!;
    }
}