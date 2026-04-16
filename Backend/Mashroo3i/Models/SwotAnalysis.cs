namespace Mashroo3i.Models
{
    public class SwotAnalysis
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid IdeaId { get; set; }

        public string Strengths { get; set; } = string.Empty;
        public string Weaknesses { get; set; } = string.Empty;
        public string Opportunities { get; set; } = string.Empty;
        public string Threats { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public BusinessIdea BusinessIdea { get; set; } = null!;
    }
}