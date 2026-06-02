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
            // ── Guard: only proceed if status is "analyzing" ──────────────────
            // The controller does the pending→analyzing transition atomically before
            // firing this method. If status is anything other than "analyzing" we
            // have no business running (already completed, already failed, or called
            // out of order). Bail out cleanly without touching the DB.
            var idea = await _db.BusinessIdeas
                .Include(i => i.EvaluationScores)
                .Include(i => i.SwotAnalysis)
                .Include(i => i.MarketAnalysis)
                .FirstOrDefaultAsync(i => i.IdeaId == ideaId, ct);

            if (idea == null)
            {
                _logger.LogError("Idea {IdeaId} not found", ideaId);
                return;
            }

            if (idea.Status != BusinessIdea.StatusAnalyzing)
            {
                _logger.LogWarning(
                    "Idea {IdeaId} has status '{Status}' — expected 'analyzing', skipping",
                    ideaId, idea.Status);
                return;
            }

            var economy = CompressJson(LoadJson("shared", "jordan_economy_snapshot.json"));
            var redFlags = CompressJson(LoadJson("shared", "red_flag_rules.json"));
            var channels = CompressJson(LoadJson("shared", "acquisition_channels.json"));

            var sectorFile = ResolveSectorFile(idea.Sector);
            var sector = sectorFile != null ? CompressJson(LoadJson("sectors", sectorFile)) : null;

            var sharedCtx = BuildSharedContext(idea, economy, sector);

            try
            {
                _logger.LogInformation("Starting parallel AI evaluation for idea {IdeaId} | sector: {Sector}", ideaId, idea.Sector);

                // ── Run all 3 AI calls in parallel — they are fully independent ──────
                var scoringTask = _ai.GenerateJsonAsync<ScoreAiResponse>(
                    BuildScoringPrompt(sharedCtx, redFlags, channels), ct);

                var swotTask = _ai.GenerateJsonAsync<SwotAiResponse>(
                    BuildSwotPrompt(sharedCtx), ct);

                var marketTask = _ai.GenerateJsonAsync<MarketAiResponse>(
                    BuildMarketPrompt(sharedCtx), ct);

                await Task.WhenAll(scoringTask, swotTask, marketTask);

                var scoreResult = await scoringTask;
                var swotResult = await swotTask;
                var marketResult = await marketTask;

                _logger.LogInformation("All 3 AI calls completed in parallel for idea {IdeaId}", ideaId);

                // ── Persist results sequentially (DbContext is not thread-safe) ──────

                // 1. Scores
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
                _logger.LogInformation("Scoring saved. Score={Score} Verdict={Verdict}",
                    scores.OverallScore, scores.Verdict);

                // 2. SWOT
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
                _logger.LogInformation("SWOT saved. Risk={Level}", swot.OverallRiskLevel);

                // 3. Market
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
                _logger.LogInformation("Market saved. Trend={Trend} Saturation={Sat}", trend, sat);

                idea.Status = BusinessIdea.StatusCompleted;
                await _db.SaveChangesAsync(ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Evaluation failed for idea {IdeaId}", ideaId);
                // Use ExecuteUpdateAsync — the tracked 'idea' entity may be in a
                // dirty/broken state after a failed SaveChangesAsync.
                await _db.BusinessIdeas
                    .Where(i => i.IdeaId == ideaId)
                    .ExecuteUpdateAsync(s =>
                        s.SetProperty(i => i.Status, "failed"),
                    CancellationToken.None);
                throw;
            }
        }

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
                Sector:       {idea.Sector}
                Budget:       {idea.EstimatedBudget} JOD
                Location:     Amman, Jordan
                """;
        }

        private static string BuildScoringPrompt(string sharedCtx, string redFlags, string channels)
        {
            return $$"""
        You are a senior analyst scoring a startup idea for the Jordanian market.
        Score honestly — do not be optimistic. Use ONLY plain text, no markdown, no asterisks.
        Write for a first-time entrepreneur with no finance background.
        When using a financial term, explain it simply in the same sentence.
        Example: "gross margin (the percentage you keep after product costs) is 35%, below the healthy 40% benchmark."
        Keep explanations natural — not in brackets, just as part of the sentence.

        {{sharedCtx}}

        === FINANCIAL RED FLAGS ===
        {{redFlags}}

        === ACQUISITION CHANNELS & CAC ===
        {{channels}}

        === SCORING (0-100 each) ===
        marketScore:     demand + purchasing power in Jordan for this idea
        financialScore:  budget vs startup costs; use the EXACT gross margin % from sector data above
        executionScore:  can a small team realistically launch in Jordan today?
        innovationScore: is the USP genuinely different from what exists in Jordan?
        overallScore:    weighted average (25% each)

        verdict: >=75 Highly Promising | 60-74 Promising | 45-59 Needs Refinement | 30-44 High Risk | <30 Not Viable

        summary: 3-4 sentences, 60-80 words. Cover the core opportunity, the main risk, and one key number. Simple language.

        strengths: Exactly 3 items.
                   Each item is ONE complete thought — never split a single strength across two items.
                   Each item: 2 sentences. First states the strength with a real number or Jordan-specific fact.
                   Second explains why it matters for this business.
                   Total per item: under 50 words.

        concerns: Exactly 3 items — no more, no less.
                  Each item is SELF-CONTAINED. A single concern must never be split across two list entries.
                  Format REQUIRED for every item: "Label: explanation"
                  Label = 3-5 plain words. No asterisks, no bold, no symbols, no colon inside the label itself.
                  Explanation = 2 sentences written as one continuous thought: first names the problem with a
                  Jordan-specific number or example, second explains the real-world consequence for this business.
                  Explain any financial term used simply in the same sentence.
                  Total per item: 50-65 words.

                  CORRECT example:
                  "Cash Flow Gap: B2B clients in Jordan typically pay 30-60 days after invoicing, meaning money earned is not cash in hand. With 1,200 JOD in monthly fixed costs you need at least 2 months of reserves before income stabilises."

                  WRONG — never do this (one concern split into two items):
                  Item 1: "Subscription Revenue Risk: Relying on subscriptions is risky if retention is low."
                  Item 2: "the typical retention rate for services is 80%, but one-off projects see lower retention."
                  The above is forbidden. Merge related thoughts into one self-contained item.

        recommendations: Exactly 3 items — no more, no less.
                         Each item is SELF-CONTAINED. A single recommendation must never be split across two list entries.
                         Format REQUIRED for every item: "Label: action"
                         Label = 3-5 plain words. No asterisks, no bold, no symbols.
                         Action = 2 sentences written as one continuous thought: first gives a specific actionable
                         step with a concrete detail (number, name, channel), second explains the expected outcome
                         and approximate timeline.
                         Use simple everyday language — no jargon.
                         Total per item: 50-65 words.

                         CORRECT example:
                         "Secure Anchor Clients First: Approach 3-5 Amman-based SMEs directly before launch and offer a 2-month pilot at a discounted rate. Locking in monthly retainers before going public gives you predictable cash flow from day one and reduces the risk of running out of money in month 3."

                         WRONG — never do this (one recommendation split into two items):
                         Item 1: "Build a Referral Program: Create a referral scheme to reduce acquisition cost."
                         Item 2: "offer a one-month free credit for every paying customer who refers a friend."
                         The above is forbidden. Merge into one self-contained item.

        Return ONLY valid JSON — no extra text, no markdown.
        strengths, concerns, and recommendations MUST be arrays of plain strings — NOT objects, NOT {"item":"..."}, NOT {"label":"..."}.
        Each array element is a single string. Example of correct format:
        {"overallScore":0,"marketScore":0,"financialScore":0,"executionScore":0,"innovationScore":0,"verdict":"","summary":"","strengths":["strength one here","strength two here","strength three here"],"concerns":["Label: explanation one here","Label: explanation two here","Label: explanation three here"],"recommendations":["Label: action one here","Label: action two here","Label: action three here"]}
        """;
        }

        private static string BuildSwotPrompt(string sharedCtx)
        {
            return $$"""
        You are a strategic advisor for the Jordanian startup ecosystem.
        Use ONLY plain text — no markdown, no asterisks, no bold symbols.
        Write for a first-time entrepreneur with no finance background.
        When using a financial term, explain it simply in the same sentence.
        Example: "delivery commissions (the fees Talabat takes per order) reach 30%, squeezing profit."
        Keep explanations natural — not in brackets, just as part of the sentence.
        Be specific — name real Jordan competitors and cite real figures.
        CRITICAL: The idea budget is clearly stated in the IDEA section above. Never invent, assume, or change this number. Always use the exact budget from the IDEA section when mentioning costs or budget.

        {{sharedCtx}}

        === SWOT RULES ===
        Each SWOT field: 3 points separated by \n.
        Each point: 2 sentences. First sentence states the fact with a specific number or Jordan-specific detail. Second sentence explains the business implication.
        Total per point: 35-50 words.
        Use the EXACT gross margin % from sector data. Be consistent with financialScore.
        Use simple language — explain any term you use.

        === RISK RULES ===
        Exactly 2 risks (cash flow + one other operational risk).
        title: 4-6 words, plain language.
        description: 2 sentences, Jordan-specific, under 50 words. First sentence explains the risk clearly with a real example or number. Second sentence describes the likely consequence for this specific business.
        mitigation: 2 sentences, concrete action, under 50 words. First sentence states what to do specifically. Second sentence explains how this reduces the risk.
        overallRiskLevel: "Low" or "Medium" or "High" or "Critical"

        Return ONLY valid JSON:
        {"strengths":"","weaknesses":"","opportunities":"","threats":"","risks":[{"title":"","description":"","mitigation":""}],"overallRiskLevel":""}
        """;
        }

        private static string BuildMarketPrompt(string sharedCtx)
        {
            return $$"""
        You are a Jordanian seed investor doing market and competitor research.
        Name actual businesses operating in Jordan. Use ONLY plain text — no markdown, no asterisks.
        Write for a first-time entrepreneur with no finance background.
        When using a financial term, explain it simply in the same sentence.
        Example: "market saturation (how crowded the market is) is HIGH, meaning many competitors already exist."
        Keep explanations natural — not in brackets, just as part of the sentence.

        {{sharedCtx}}

        === OUTPUT RULES — substantive but focused ===
        fatalFlaw:               2 sentences, under 50 words. First sentence names the specific blocker in Jordan. Second explains why it matters for this business.
        competitorAnalysis:      2 sentences, under 50 words. Use the knownCompetitors list from the sector data above as your PRIMARY source — pick the 2 most relevant with their actual price ranges and strengths. Second sentence explains what makes them a real threat to this specific idea.
        likelyFailureMode:       2 sentences, under 45 words. First sentence describes the failure scenario specifically. Second explains the warning signs to watch for.
        marketSize:              Use the marketSize_JOD field from the sector data above — pick the most relevant sub-market value and format as "~X JOD". Do NOT invent a number. Example: if sector data shows "28-38M", output "~33M JOD".
        saturation:              "HIGH" or "MEDIUM" or "LOW" — one word only. Base on knownCompetitors count and marketSize context in the sector data.
        marketTrend:             Use the growthTrend field from marketSize_JOD in the sector data: output "GROWING", "STABLE", or "DECLINING" exactly.
        marketTrendReason:       2 sentences, under 45 words. First sentence gives one Jordan-specific stat or trend from the sector data. Second sentence explains what this means for the business.
        differentiationAnalysis: 3 sentences, under 60 words total. First explains the current gap in the market. Second describes how this idea fills it. Third states the realistic competitive advantage.
        competitors:             Exactly 2 competitors. ALWAYS use the knownCompetitors list from the sector data as your primary source — pick the 2 most relevant entries.
                                 Use their EXACT names, priceRanges, targetSegments, and mainStrengths from the sector data.
                                 Only fall back to your own knowledge if fewer than 2 are listed in the sector data.
                                 Each: name, description (phrase under 10 words),
                                 threat (HIGH or MEDIUM or LOW),
                                 priceRange, targetSegment, mainStrength.

        marketOpportunities:     Exactly 3 opportunities — no more, no less.
                                 Every opportunity MUST have all 3 fields populated. Never leave title empty or generic.

                                 title: 5-8 words describing the specific actionable opportunity.
                                        The title must describe WHAT to do or WHAT the opportunity is — not just name a concept.
                                        BAD title (too vague, just a concept): "Shared office for freelancers"
                                        BAD title (empty or generic): "Growth opportunity" / "Market expansion"
                                        GOOD title: "Target Freelancers Through Coworking Space Partnerships"
                                        GOOD title: "Offer Corporate Wellness Packages to Amman SMEs"

                                 description: 2 sentences, under 45 words.
                                              First sentence describes the opportunity with a Jordan-specific stat or context.
                                              Second sentence explains exactly how to capture it with a concrete action.

                                 benefit: phrase under 10 words, specific and measurable — not vague.
                                          BAD benefit: "Good opportunity" / "Increases revenue"
                                          GOOD benefit: "Cuts customer acquisition cost by up to 40%"
                                          GOOD benefit: "Adds a stable recurring revenue stream"

        Return ONLY valid JSON:
        {"fatalFlaw":"","competitorAnalysis":"","likelyFailureMode":"","marketSize":"","saturation":"","competitors":[{"name":"","description":"","threat":"","priceRange":"","targetSegment":"","mainStrength":""}],"marketOpportunities":[{"title":"","description":"","benefit":""}],"marketTrend":"","marketTrendReason":"","differentiationAnalysis":""}
        """;
        }

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

        private static string CompressJson(string json)
        {
            try
            {
                var node = JsonNode.Parse(json);
                if (node == null) return json;
                StripNoise(node);
                return node.ToJsonString(new JsonSerializerOptions { WriteIndented = false });
            }
            catch { return json; }
        }

        private static void StripNoise(JsonNode node)
        {
            if (node is JsonObject obj)
            {
                var toRemove = obj.Select(kvp => kvp.Key)
                    .Where(k => _noiseKeys.Contains(k)).ToList();
                foreach (var key in toRemove) obj.Remove(key);
                foreach (var child in obj) StripNoise(child.Value!);
            }
            else if (node is JsonArray arr)
            {
                foreach (var item in arr)
                    if (item != null) StripNoise(item);
            }
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