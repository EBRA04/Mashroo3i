namespace Mashroo3i.Models
{
    public class MarketAnalysis
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid IdeaId { get; set; }

        public string MarketSize { get; set; } = string.Empty;
        public string FatalFlaws { get; set; } = string.Empty;
        public string LikelyFailureMode { get; set; } = string.Empty;
        public string CompetitorAnalysis { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Navigation property
        public BusinessIdea BusinessIdea { get; set; } = null!;
    }
}