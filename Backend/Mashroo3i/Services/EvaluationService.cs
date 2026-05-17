using System.Text.Json;
using System.Text.Json.Nodes;
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

        // Keys that are documentation for humans, not data for the AI.
        // Stripping them cuts token usage ~30% on the JSON files.
        private static readonly HashSet<string> _noiseKeys = new(StringComparer.OrdinalIgnoreCase)
        {
            "_meta", "label", "labelAr", "description", "subSectors", "examplesAmman",
            "notes", "unit", "confidence", "sources", "purpose", "version",
            "lastUpdated", "file", "sector", "sectorKey", "message",
        };

        public EvaluationService(
            AppDbContext db, IAIService ai,
            IWebHostEnvironment env, ILogger<EvaluationService> logger)
        {
            _db = db; _ai = ai; _env = env; _logger = logger;
        }

        public async Task EvaluateAsync(Guid ideaId, CancellationToken ct = default)
        {
            var idea = await _db.BusinessIdeas
                .Include(i => i.EvaluationScores)
                .Include(i => i.SwotAnalysis)
                .Include(i => i.MarketAnalysis)
                .FirstOrDefaultAsync(i => i.IdeaId == ideaId, ct);

            if (idea == null) { _logger.LogError("Idea {IdeaId} not found", ideaId); return; }

            if (idea.Status == BusinessIdea.StatusCompleted)
            {
                _logger.LogWarning("Idea {IdeaId} already evaluated", ideaId);
                return;
            }

            idea.Status = BusinessIdea.StatusAnalyzing;
            await _db.SaveChangesAsync(ct);

            // ── Load & compress data files ONCE ──────────────────────────────
            // Strip documentation keys so the AI gets numbers, not prose.
            var economy = CompressJson(LoadJson("shared", "jordan_economy_snapshot.json"));
            var redFlags = CompressJson(LoadJson("shared", "red_flag_rules.json"));
            var channels = CompressJson(LoadJson("shared", "acquisition_channels.json"));

            var sectorFile = ResolveSectorFile(idea.Sector);
            var sector = sectorFile != null ? CompressJson(LoadJson("sectors", sectorFile)) : null;

            // ── Shared context block (economy + sector) — injected into all 3 prompts ──
            var sharedCtx = BuildSharedContext(idea, economy, sector);

            try
            {
                // ── 1. Scoring ───────────────────────────────────────────────
                _logger.LogInformation("Scoring idea {IdeaId} | sector: {Sector}", ideaId, idea.Sector);

                var scoreResult = await _ai.GenerateJsonAsync<ScoreAiResponse>(
                    BuildScoringPrompt(sharedCtx, redFlags, channels), ct);

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
                _logger.LogInformation("Scoring done. Score={Score} Verdict={Verdict}",
                    scores.OverallScore, scores.Verdict);

                // ── 2. SWOT + Risk ───────────────────────────────────────────
                _logger.LogInformation("SWOT for idea {IdeaId}", ideaId);

                var swotResult = await _ai.GenerateJsonAsync<SwotAiResponse>(
                    BuildSwotPrompt(sharedCtx), ct);

                var risksJson = JsonSerializer.Serialize(
                    swotResult.Risks ?? new List<RiskItem>(),
                    new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });

                var swot = new SwotAnalysis
                {
                    IdeaId = ideaId,
                    Strengths = swotResult.Strengths ?? string.Empty,
                    Weaknesses = swotResult.Weaknesses ?? string.Empty,
                    Opportunities = swotResult.Opportunities ?? string.Empty,
                    Threats = swotResult.Threats ?? string.Empty,
                    Risks = risksJson,
                    OverallRiskLevel = swotResult.OverallRiskLevel ?? "Medium",
                };

                if (idea.SwotAnalysis != null)
                    _db.Entry(idea.SwotAnalysis).CurrentValues.SetValues(swot);
                else
                    _db.SwotAnalyses.Add(swot);

                await _db.SaveChangesAsync(ct);
                _logger.LogInformation("SWOT done. Risk={Level}", swot.OverallRiskLevel);

                // ── 3. Market & Competitor Analysis ──────────────────────────
                _logger.LogInformation("Market analysis for idea {IdeaId}", ideaId);

                var marketResult = await _ai.GenerateJsonAsync<MarketAiResponse>(
                    BuildMarketPrompt(sharedCtx), ct);

                var rawTrend = (marketResult.MarketTrend ?? "STABLE").ToUpperInvariant();
                var trend = rawTrend is "GROWING" or "DECLINING" ? rawTrend : "STABLE";

                var rawSat = (marketResult.Saturation ?? "MEDIUM").ToUpperInvariant();
                var sat = rawSat is "HIGH" or "LOW" ? rawSat : "MEDIUM";

                var competitorsJson = JsonSerializer.Serialize(
                    marketResult.Competitors ?? new List<CompetitorItem>(),
                    new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });

                var opportunitiesJson = JsonSerializer.Serialize(
                    marketResult.MarketOpportunities ?? new List<OpportunityItem>(),
                    new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });

                var market = new MarketAnalysis
                {
                    IdeaId = ideaId,
                    MarketSize = marketResult.MarketSize ?? string.Empty,
                    FatalFlaws = marketResult.FatalFlaw ?? string.Empty,
                    LikelyFailureMode = marketResult.LikelyFailureMode ?? string.Empty,
                    CompetitorAnalysis = marketResult.CompetitorAnalysis ?? string.Empty,
                    Saturation = sat,
                    CompetitorsJson = competitorsJson,
                    MarketOpportunitiesJson = opportunitiesJson,
                    MarketTrend = trend,
                    MarketTrendReason = marketResult.MarketTrendReason ?? string.Empty,
                    DifferentiationAnalysis = marketResult.DifferentiationAnalysis ?? string.Empty,
                };

                if (idea.MarketAnalysis != null)
                    _db.Entry(idea.MarketAnalysis).CurrentValues.SetValues(market);
                else
                    _db.MarketAnalyses.Add(market);

                await _db.SaveChangesAsync(ct);
                _logger.LogInformation("Market done. Trend={Trend} Saturation={Sat}", trend, sat);

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

        // ── Shared context (built ONCE, reused in all 3 prompts) ─────────────

        private static string BuildSharedContext(BusinessIdea idea, string economy, string? sector)
        {
            var sectorBlock = sector != null
                ? $"=== SECTOR: {idea.Sector.ToUpper()} ===\n{sector}"
                : $"=== SECTOR: {idea.Sector.ToUpper()} ===\nNo benchmark file. Infer from idea + economy data.";

            return $"""
                === JORDAN ECONOMY (Amman) ===
                {economy}

                {sectorBlock}

                === IDEA ===
                Title:        {idea.Title}
                Description:  {idea.Description}
                Problem:      {idea.ProblemStatement ?? "—"}
                Target:       {idea.TargetAudience ?? "—"}
                USP:          {idea.Usp ?? "—"}
                Type:         {idea.BusinessType}
                Sector:       {idea.Sector}
                Budget:       {idea.EstimatedBudget} JOD
                Location:     {idea.Provinces}
                """;
        }

        // ── Prompt Builders ───────────────────────────────────────────────────

        private static string BuildScoringPrompt(string sharedCtx, string redFlags, string channels)
        {
            return $$"""
                You are a senior analyst scoring a startup idea for the Jordanian market.
                Score honestly — do not be optimistic.

                {{sharedCtx}}

                === FINANCIAL RED FLAGS ===
                {{redFlags}}

                === ACQUISITION CHANNELS & CAC ===
                {{channels}}

                === SCORING (0–100 each) ===
                marketScore:     demand + purchasing power in Jordan for this idea
                financialScore:  budget vs. startup costs; margins vs. red flag thresholds
                executionScore:  can a small team realistically launch in Jordan today?
                innovationScore: is the USP genuinely different from what exists in Jordan?
                overallScore:    weighted average (25% each)

                verdict: ≥75→"Highly Promising" | 60-74→"Promising" | 45-59→"Needs Refinement" | 30-44→"High Risk" | <30→"Not Viable"

                strengths (2-3):       specific, cite a real number or fact where possible
                concerns:              Return exactly 4 items. Each concern must have a SHORT BOLD LABEL (3-5 words) followed by ": " then 2-3 sentences of explanation — why it matters specifically in Jordan, with a real number or fact where possible. Format: "Label: Explanation sentences." Max 55 words per item.
                recommendations:       Return exactly 4 items. Each must have a SHORT BOLD LABEL (3-6 words) followed by ": " then 2-3 concrete sentences — what to do, how, and why it will help this specific idea in Jordan. Start with an action verb after the label. Max 60 words per item.

                Return ONLY valid JSON:
                {"overallScore":0,"marketScore":0,"financialScore":0,"executionScore":0,"innovationScore":0,"verdict":"","summary":"","strengths":[],"concerns":[],"recommendations":[]}
                """;
        }

        private static string BuildSwotPrompt(string sharedCtx)
        {
            return $$"""
                You are a strategic advisor for the Jordanian startup ecosystem.
                Conduct a SWOT analysis. Be specific — name real competitors and cite actual figures.

                {{sharedCtx}}

                === SWOT RULES ===
                Each field: 2-3 points separated by \n. No bullets, no numbering.
                Each point: 1-2 sentences (25-40 words). Name real competitors and real cost figures.

                === RISK RULES ===
                2-3 internal execution risks (cash flow, staffing, ops — distinct from SWOT threats).
                Each: "title" (4-6 words), "description" (1-2 sentences, Jordan-specific), "mitigation" (1-2 sentences, concrete action).
                overallRiskLevel: "Low"|"Medium"|"High"|"Critical"

                Return ONLY valid JSON:
                {"strengths":"","weaknesses":"","opportunities":"","threats":"","risks":[{"title":"","description":"","mitigation":""}],"overallRiskLevel":""}
                """;
        }

        private static string BuildMarketPrompt(string sharedCtx)
        {
            return $$"""
                You are a Jordanian seed investor conducting market and competitor analysis.
                Name actual businesses operating in Jordan. Most markets are MEDIUM saturation.

                {{sharedCtx}}

                === OUTPUT RULES ===
                fatalFlaw:             The single most serious blocker for this idea in Jordan (1-2 sentences, be direct).
                competitorAnalysis:    Name real Jordan businesses doing something similar (1-2 sentences).
                likelyFailureMode:     If this closes in 18 months — exactly what happened? (1 sentence, present tense)
                marketSize:            Total addressable market in Jordan. Format: "~45M JOD"
                saturation:            "HIGH"|"MEDIUM"|"LOW"
                competitors:           2-3 real Jordan competitors. Fields: name, description (one phrase), threat (HIGH/MEDIUM/LOW), priceRange, targetSegment, mainStrength.
                marketOpportunities:   3 specific, actionable opportunities for this business in Jordan right now.
                                       Each opportunity MUST be a JSON object with these exact fields:
                                       "title"       — a complete, self-explanatory title (5-9 words, no trailing dots or ellipsis)
                                       "description" — 1-2 sentences that ADD detail not already in the title (different wording, more context)
                                       "benefit"     — expected business benefit in one short phrase (e.g. "15-20% revenue uplift")
                marketTrend:           "GROWING"|"STABLE"|"DECLINING"
                marketTrendReason:     One sentence explaining the trend with Jordan-specific data.
                differentiationAnalysis: 2 sentences on what makes this different and whether that difference is strong or weak.

                Return ONLY valid JSON:
                {"fatalFlaw":"","competitorAnalysis":"","likelyFailureMode":"","marketSize":"","saturation":"","competitors":[],"marketOpportunities":[{"title":"","description":"","benefit":""}],"marketTrend":"","marketTrendReason":"","differentiationAnalysis":""}
                """;
        }

        // ── Helpers ───────────────────────────────────────────────────────────

        private static string? ResolveSectorFile(string sector) => sector.ToLower() switch
        {
            "tech" or "software" or "tech_software" => "tech_software.json",
            "food" or "fnb" or "food_and_beverage" => "food_and_beverage.json",
            "health" or "wellness" or "health_wellness" => "health_wellness.json",
            "education" or "edtech" or "education_training" => "education_training.json",
            "professional" or "services" or "professional_services" => "professional_services.json",
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

        /// <summary>
        /// Strips documentation-only keys from a JSON string so the AI only sees numbers and data.
        /// Reduces token count by ~30% on the data files without losing analytical value.
        /// </summary>
        private static string CompressJson(string json)
        {
            try
            {
                var node = JsonNode.Parse(json);
                if (node == null) return json;
                StripNoise(node);
                return node.ToJsonString(new JsonSerializerOptions { WriteIndented = false });
            }
            catch
            {
                return json; // if parse fails, return as-is
            }
        }

        private static void StripNoise(JsonNode node)
        {
            if (node is JsonObject obj)
            {
                var toRemove = obj
                    .Select(kvp => kvp.Key)
                    .Where(k => _noiseKeys.Contains(k))
                    .ToList();

                foreach (var key in toRemove)
                    obj.Remove(key);

                foreach (var child in obj)
                    StripNoise(child.Value!);
            }
            else if (node is JsonArray arr)
            {
                foreach (var item in arr)
                    if (item != null) StripNoise(item);
            }
        }

        private static int Clamp(int v) => Math.Clamp(v, 0, 100);

        // ── AI response models ────────────────────────────────────────────────

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

        private class RiskItem
        {
            public string Title { get; set; } = string.Empty;
            public string Description { get; set; } = string.Empty;
            public string Mitigation { get; set; } = string.Empty;
        }

        private class SwotAiResponse
        {
            public string? Strengths { get; set; }
            public string? Weaknesses { get; set; }
            public string? Opportunities { get; set; }
            public string? Threats { get; set; }
            public List<RiskItem>? Risks { get; set; }
            public string? OverallRiskLevel { get; set; }
        }

        private class MarketAiResponse
        {
            public string? FatalFlaw { get; set; }
            public string? CompetitorAnalysis { get; set; }
            public string? LikelyFailureMode { get; set; }
            public string? MarketSize { get; set; }
            public string? Saturation { get; set; }
            public List<CompetitorItem>? Competitors { get; set; }
            public List<OpportunityItem>? MarketOpportunities { get; set; }
            public string? MarketTrend { get; set; }
            public string? MarketTrendReason { get; set; }
            public string? DifferentiationAnalysis { get; set; }
        }

        private class CompetitorItem
        {
            public string Name { get; set; } = string.Empty;
            public string Description { get; set; } = string.Empty;
            public string Threat { get; set; } = string.Empty;
            public string PriceRange { get; set; } = string.Empty;
            public string TargetSegment { get; set; } = string.Empty;
            public string MainStrength { get; set; } = string.Empty;
        }

        private class OpportunityItem
        {
            public string Title { get; set; } = string.Empty;
            public string Description { get; set; } = string.Empty;
            public string Benefit { get; set; } = string.Empty;
        }
    }
}