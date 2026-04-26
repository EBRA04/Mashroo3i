using Mashroo3i.Data;
using Mashroo3i.Models;
using Mashroo3i.Services.AI;
using Microsoft.EntityFrameworkCore;

namespace Mashroo3i.Services
{
    public class EvaluationService
    {
        private readonly AppDbContext _db;
        private readonly IAIService _ai;
        private readonly IWebHostEnvironment _env;
        private readonly ILogger<EvaluationService> _logger;

        public EvaluationService(
            AppDbContext db,
            IAIService ai,
            IWebHostEnvironment env,
            ILogger<EvaluationService> logger)
        {
            _db = db;
            _ai = ai;
            _env = env;
            _logger = logger;
        }

        public async Task EvaluateAsync(Guid ideaId, CancellationToken ct = default)
        {
            var idea = await _db.BusinessIdeas
                .Include(i => i.EvaluationScores)
                .Include(i => i.SwotAnalysis)
                .FirstOrDefaultAsync(i => i.IdeaId == ideaId, ct);

            if (idea == null) { _logger.LogError("Idea {IdeaId} not found", ideaId); return; }

            if (idea.Status == BusinessIdea.StatusCompleted)
            {
                _logger.LogWarning("Idea {IdeaId} already evaluated", ideaId);
                return;
            }

            idea.Status = BusinessIdea.StatusAnalyzing;
            await _db.SaveChangesAsync(ct);

            var economyData = LoadJson("shared", "jordan_economy_snapshot.json");
            var redFlagData = LoadJson("shared", "red_flag_rules.json");
            var channelsData = LoadJson("shared", "acquisition_channels.json");

            var sectorFile = ResolveSectorFile(idea.Sector);
            var sectorData = sectorFile != null ? LoadJson("sectors", sectorFile) : null;

            try
            {
                // ── Scoring ───────────────────────────────────────────────────
                _logger.LogInformation("Scoring idea {IdeaId} | sector: {Sector}", ideaId, idea.Sector);

                var scoreResult = await _ai.GenerateJsonAsync<ScoreAiResponse>(
                    BuildScoringPrompt(idea, sectorData, economyData, redFlagData, channelsData), ct);

                var scores = new EvaluationScores
                {
                    IdeaId = ideaId,
                    OverallScore = Clamp(scoreResult.OverallScore),
                    MarketScore = Clamp(scoreResult.MarketScore),
                    FinancialScore = Clamp(scoreResult.FinancialScore),
                    ExecutionScore = Clamp(scoreResult.ExecutionScore),
                    InnovationScore = Clamp(scoreResult.InnovationScore),
                    Verdict = scoreResult.Verdict ?? "Needs Refinement",
                    Summary = scoreResult.Summary ?? string.Empty,
                    Strengths = string.Join("; ", scoreResult.Strengths ?? new()),
                    Concerns = string.Join("; ", scoreResult.Concerns ?? new()),
                    Recommendations = string.Join("; ", scoreResult.Recommendations ?? new()),
                };

                if (idea.EvaluationScores != null)
                    _db.Entry(idea.EvaluationScores).CurrentValues.SetValues(scores);
                else
                    _db.EvaluationScores.Add(scores);

                await _db.SaveChangesAsync(ct);
                _logger.LogInformation("Scoring done. Score: {Score}, Verdict: {Verdict}", scores.OverallScore, scores.Verdict);

                // ── SWOT + Risk ───────────────────────────────────────────────
                _logger.LogInformation("SWOT for idea {IdeaId}", ideaId);

                var swotResult = await _ai.GenerateJsonAsync<SwotAiResponse>(
                    BuildSwotPrompt(idea, sectorData, economyData), ct);

                var swot = new SwotAnalysis
                {
                    IdeaId = ideaId,
                    Strengths = swotResult.Strengths ?? string.Empty,
                    Weaknesses = swotResult.Weaknesses ?? string.Empty,
                    Opportunities = swotResult.Opportunities ?? string.Empty,
                    Threats = swotResult.Threats ?? string.Empty,
                    Risks = swotResult.Risks ?? string.Empty,
                    OverallRiskLevel = swotResult.OverallRiskLevel ?? "Medium",
                };

                if (idea.SwotAnalysis != null)
                    _db.Entry(idea.SwotAnalysis).CurrentValues.SetValues(swot);
                else
                    _db.SwotAnalyses.Add(swot);

                await _db.SaveChangesAsync(ct);
                _logger.LogInformation("SWOT done. Risk: {Level}", swot.OverallRiskLevel);

                idea.Status = BusinessIdea.StatusCompleted;
                await _db.SaveChangesAsync(ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Evaluation failed for idea {IdeaId}", ideaId);
                idea.Status = "failed";
                await _db.SaveChangesAsync(CancellationToken.None);
                throw;
            }
        }

        // ── Prompt Builders ───────────────────────────────────────────────────
        // Using $$"""...""" (two dollar signs).
        // Rule: with $$, interpolation requires DOUBLE braces {{expr}}.
        //       single { and } are just literal characters — no escaping needed.
        // This is why the JSON templates below can use normal { } without any tricks.

        private static string BuildScoringPrompt(
            BusinessIdea idea,
            string? sectorData,
            string economyData,
            string redFlagData,
            string channelsData)
        {
            var sectorSection = sectorData != null
                ? $$"""
                  === SECTOR BENCHMARKS: {{idea.Sector.ToUpper()}} ===
                  Use these numbers for margin estimates, startup costs, CAC, and break-even timelines.
                  {{sectorData}}
                  """
                : $$"""
                  === SECTOR BENCHMARKS ===
                  No pre-built benchmark data for sector "{{idea.Sector}}".
                  Infer realistic benchmarks from the idea description and Jordan economy data.
                  Apply conservative estimates and flag anything you are inferring rather than citing.
                  """;

            return $$"""
                You are a senior business analyst evaluating startup ideas for the Jordanian market (Amman).
                Use ONLY the data provided below. Do not invent statistics not grounded in this context.

                === JORDAN ECONOMY ===
                {{economyData}}

                {{sectorSection}}

                === ACQUISITION CHANNELS ===
                {{channelsData}}

                === RED FLAG RULES ===
                {{redFlagData}}

                === IDEA ===
                Title:          {{idea.Title}}
                Description:    {{idea.Description}}
                Problem:        {{idea.ProblemStatement ?? "Not provided"}}
                Target:         {{idea.TargetAudience ?? "Not provided"}}
                USP:            {{idea.Usp ?? "Not provided"}}
                Business Type:  {{idea.BusinessType}}
                Sector:         {{idea.Sector}}
                Budget:         {{idea.EstimatedBudget}} JOD
                Location:       {{idea.Provinces}}

                === SCORING INSTRUCTIONS ===
                Score each dimension 0–100. Be honest, not optimistic.

                marketScore:     market size, demand, purchasing power for this idea in Jordan
                financialScore:  does the budget cover startup costs? are margins viable per red flag rules?
                executionScore:  can a small team realistically launch this in Jordan today?
                innovationScore: is the USP genuinely different from what already exists in Jordan?
                overallScore:    weighted average (market 25% + financial 25% + execution 25% + innovation 25%)

                verdict:
                  >= 75 → "Highly Promising"
                  60–74 → "Promising"
                  45–59 → "Needs Refinement"
                  30–44 → "High Risk"
                  < 30  → "Not Viable"

                strengths:       2–3 specific strengths backed by the data above
                concerns:        2–3 specific risks that could prevent success in Jordan
                recommendations: 2–3 concrete next steps specific to Jordan

                Return ONLY valid JSON — no markdown, no explanation:
                {
                  "overallScore": <0-100>,
                  "marketScore": <0-100>,
                  "financialScore": <0-100>,
                  "executionScore": <0-100>,
                  "innovationScore": <0-100>,
                  "verdict": "<verdict>",
                  "summary": "<2-3 sentence summary>",
                  "strengths": ["<item>", "<item>"],
                  "concerns": ["<item>", "<item>"],
                  "recommendations": ["<item>", "<item>", "<item>"]
                }
                """;
        }

        private static string BuildSwotPrompt(BusinessIdea idea, string? sectorData, string economyData)
        {
            var sectorSection = sectorData != null
                ? $$"""
                  === SECTOR: {{idea.Sector.ToUpper()}} ===
                  {{sectorData}}
                  """
                : $$"""
                  === SECTOR ===
                  No pre-built data for sector "{{idea.Sector}}".
                  Derive all SWOT points from the idea description and Jordan economy context.
                  """;

            return $$"""
                You are a strategic business advisor for the Jordanian startup ecosystem (Amman).
                Conduct a SWOT analysis and risk assessment grounded in the data provided.
                Be specific — reference real numbers, name competitors that exist in Jordan.

                === JORDAN ECONOMY ===
                {{economyData}}

                {{sectorSection}}

                === IDEA ===
                Title:          {{idea.Title}}
                Description:    {{idea.Description}}
                Problem:        {{idea.ProblemStatement ?? "Not provided"}}
                Target:         {{idea.TargetAudience ?? "Not provided"}}
                USP:            {{idea.Usp ?? "Not provided"}}
                Business Type:  {{idea.BusinessType}}
                Sector:         {{idea.Sector}}
                Budget:         {{idea.EstimatedBudget}} JOD
                Location:       {{idea.Provinces}}

                === INSTRUCTIONS ===
                Each SWOT field: write a paragraph with 3–4 specific points (not bullet points).
                Strengths/Weaknesses = internal to this idea.
                Opportunities/Threats = external market, economy, and competitive factors.

                risks: a paragraph covering 3–4 specific risks for this idea in Jordan.
                  For each: what the risk is, how likely, one concrete mitigation action.
                overallRiskLevel: "Low" | "Medium" | "High" | "Critical"

                Return ONLY valid JSON — no markdown, no explanation:
                {
                  "strengths": "<paragraph>",
                  "weaknesses": "<paragraph>",
                  "opportunities": "<paragraph>",
                  "threats": "<paragraph>",
                  "risks": "<paragraph>",
                  "overallRiskLevel": "<Low|Medium|High|Critical>"
                }
                """;
        }

        // ── Helpers ───────────────────────────────────────────────────────────

        private static string? ResolveSectorFile(string sector) => sector.ToLower() switch
        {
            "tech" or "software" or "tech_software" => "tech_software.json",
            "food" or "fnb" or "food_and_beverage" => "food_and_beverage.json",
            "health" or "wellness" or "health_wellness" => "health_wellness.json",
            "education" or "edtech" or "education_training" => "education_training.json",
            "professional" or "professional_services" => "professional_services.json",
            "retail" or "ecommerce" or "retail_ecommerce" => "retail_ecommerce.json",
            _ => null,
        };

        private string LoadJson(string folder, string fileName)
        {
            var path = Path.Combine(_env.ContentRootPath, "Data", folder, fileName);
            if (!File.Exists(path))
            {
                _logger.LogWarning("Data file not found: {Path}", path);
                return "{}";
            }
            return File.ReadAllText(path);
        }

        private static int Clamp(int v) => Math.Clamp(v, 0, 100);

        private class ScoreAiResponse
        {
            public int OverallScore { get; set; }
            public int MarketScore { get; set; }
            public int FinancialScore { get; set; }
            public int ExecutionScore { get; set; }
            public int InnovationScore { get; set; }
            public string? Verdict { get; set; }
            public string? Summary { get; set; }
            public List<string>? Strengths { get; set; }
            public List<string>? Concerns { get; set; }
            public List<string>? Recommendations { get; set; }
        }

        private class SwotAiResponse
        {
            public string? Strengths { get; set; }
            public string? Weaknesses { get; set; }
            public string? Opportunities { get; set; }
            public string? Threats { get; set; }
            public string? Risks { get; set; }
            public string? OverallRiskLevel { get; set; }
        }
    }
}