namespace Mashroo3i.Models
{
    public class EvaluationScores
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid IdeaId { get; set; }

        public int OverallScore { get; set; }
        public int NoveltyScore { get; set; }
        public int MarketScore { get; set; }
        public string Verdict { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // For Navigation 
        public BusinessIdea BusinessIdea { get; set; } = null!;
    }
}