using Mashroo3i.Data;
using Mashroo3i.Models;
using Mashroo3i.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Mashroo3i.Controllers
{
    [ApiController]
    [Route("api/evaluation")]
    [Authorize]
    public class EvaluationController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<EvaluationController> _logger;

        public EvaluationController(
            AppDbContext db,
            IServiceScopeFactory scopeFactory,
            ILogger<EvaluationController> logger)
        {
            _db = db;
            _scopeFactory = scopeFactory;
            _logger = logger;
        }

        // POST /api/evaluation/{ideaId}/start
        // Kicks off the evaluation in the background, returns 202 immediately.
        // Client polls GET /results until status is "completed" or "failed".
        [HttpPost("{ideaId:guid}/start")]
        public async Task<IActionResult> Start(Guid ideaId)
        {
            var userId = GetUserId();
            if (userId == null) return Unauthorized();

            var idea = await _db.BusinessIdeas
                .FirstOrDefaultAsync(i => i.IdeaId == ideaId && i.UserId == userId.Value);

            if (idea == null) return NotFound(new { message = "Idea not found." });

            if (idea.Status == BusinessIdea.StatusCompleted)
                return Ok(new { message = "Already evaluated.", idea.Status });

            if (idea.Status == BusinessIdea.StatusAnalyzing)
                return Accepted(new { message = "Evaluation already in progress.", idea.Status });

            // Fire-and-forget with a fresh DI scope.
            // We can't use the request's EvaluationService instance here because
            // the request scope (and its DbContext) will be disposed once we return 202.
            // CreateAsyncScope() gives the background task its own independent lifetime.
            _ = Task.Run(async () =>
            {
                await using var scope = _scopeFactory.CreateAsyncScope();
                var evalService = scope.ServiceProvider.GetRequiredService<EvaluationService>();
                try
                {
                    await evalService.EvaluateAsync(ideaId);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Background evaluation failed for idea {IdeaId}", ideaId);
                }
            });

            return Accepted(new
            {
                message = "Evaluation started. Poll GET /api/evaluation/{ideaId}/results for updates.",
                ideaId,
                status = BusinessIdea.StatusAnalyzing
            });
        }

        // GET /api/evaluation/{ideaId}/results
        // Returns the full evaluation results. Frontend polls this after calling /start.
        [HttpGet("{ideaId:guid}/results")]
        public async Task<IActionResult> GetResults(Guid ideaId)
        {
            var userId = GetUserId();
            if (userId == null) return Unauthorized();

            var idea = await _db.BusinessIdeas
                .Include(i => i.EvaluationScores)
                .Include(i => i.SwotAnalysis)
                .FirstOrDefaultAsync(i => i.IdeaId == ideaId && i.UserId == userId.Value);

            if (idea == null) return NotFound(new { message = "Idea not found." });

            return Ok(new
            {
                ideaId = idea.IdeaId,
                status = idea.Status,
                scoring = idea.EvaluationScores == null ? null : new
                {
                    idea.EvaluationScores.OverallScore,
                    idea.EvaluationScores.MarketScore,
                    idea.EvaluationScores.FinancialScore,
                    idea.EvaluationScores.ExecutionScore,
                    idea.EvaluationScores.InnovationScore,
                    idea.EvaluationScores.Verdict,
                    idea.EvaluationScores.Summary,
                    strengths = idea.EvaluationScores.Strengths.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
                    concerns = idea.EvaluationScores.Concerns.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
                    recommendations = idea.EvaluationScores.Recommendations.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
                },
                swot = idea.SwotAnalysis == null ? null : new
                {
                    idea.SwotAnalysis.Strengths,
                    idea.SwotAnalysis.Weaknesses,
                    idea.SwotAnalysis.Opportunities,
                    idea.SwotAnalysis.Threats,
                    idea.SwotAnalysis.Risks,
                    idea.SwotAnalysis.OverallRiskLevel,
                }
            });
        }

        private Guid? GetUserId()
        {
            var claim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            return Guid.TryParse(claim, out var id) ? id : null;
        }
    }
}