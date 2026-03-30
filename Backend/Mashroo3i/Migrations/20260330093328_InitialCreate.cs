using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Mashroo3i.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    FullName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Email = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    PasswordHash = table.Column<string>(type: "text", nullable: false),
                    Role = table.Column<string>(type: "text", nullable: false, defaultValue: "Entrepreneur"),
                    Education = table.Column<string>(type: "text", nullable: false),
                    Experience = table.Column<string>(type: "text", nullable: false),
                    BusinessInterest = table.Column<string>(type: "text", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "BusinessIdeas",
                columns: table => new
                {
                    IdeaId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    ProblemStatement = table.Column<string>(type: "text", nullable: true),
                    TargetAudience = table.Column<string>(type: "text", nullable: true),
                    Usp = table.Column<string>(type: "text", nullable: true),
                    BusinessType = table.Column<string>(type: "text", nullable: false),
                    Sector = table.Column<string>(type: "text", nullable: false),
                    AmmanRegion = table.Column<string>(type: "text", nullable: false),
                    BusinessTypeReason = table.Column<string>(type: "text", nullable: true),
                    EstimatedBudget = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BusinessIdeas", x => x.IdeaId);
                    table.ForeignKey(
                        name: "FK_BusinessIdeas_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Evaluations",
                columns: table => new
                {
                    EvaluationId = table.Column<Guid>(type: "uuid", nullable: false),
                    IdeaId = table.Column<Guid>(type: "uuid", nullable: false),
                    NoveltyScore = table.Column<int>(type: "integer", nullable: false),
                    MarketPotentialScore = table.Column<int>(type: "integer", nullable: false),
                    OverallScore = table.Column<int>(type: "integer", nullable: false),
                    RiskLevel = table.Column<string>(type: "text", nullable: false),
                    Strengths = table.Column<string>(type: "text", nullable: false),
                    Weaknesses = table.Column<string>(type: "text", nullable: false),
                    Opportunities = table.Column<string>(type: "text", nullable: false),
                    Threats = table.Column<string>(type: "text", nullable: false),
                    Recommendations = table.Column<string>(type: "text", nullable: true),
                    Verdict = table.Column<string>(type: "text", nullable: true),
                    RedFlags = table.Column<string>(type: "text", nullable: true),
                    GeneratedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Evaluations", x => x.EvaluationId);
                    table.ForeignKey(
                        name: "FK_Evaluations_BusinessIdeas_IdeaId",
                        column: x => x.IdeaId,
                        principalTable: "BusinessIdeas",
                        principalColumn: "IdeaId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FinancialPlans",
                columns: table => new
                {
                    PlanId = table.Column<Guid>(type: "uuid", nullable: false),
                    IdeaId = table.Column<Guid>(type: "uuid", nullable: false),
                    InitialInvestment = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    MonthlyRevenue = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    MonthlyCosts = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    BreakEvenMonths = table.Column<int>(type: "integer", nullable: false),
                    RoiPercentage = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    MonthlyProfit = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    GrossMarginPct = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    BreakEvenUnits = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    LTV = table.Column<decimal>(type: "numeric", nullable: true),
                    CAC = table.Column<decimal>(type: "numeric", nullable: true),
                    LtvCacRatio = table.Column<decimal>(type: "numeric", nullable: true),
                    ARR = table.Column<decimal>(type: "numeric", nullable: true),
                    FinancialSummary = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FinancialPlans", x => x.PlanId);
                    table.ForeignKey(
                        name: "FK_FinancialPlans_BusinessIdeas_IdeaId",
                        column: x => x.IdeaId,
                        principalTable: "BusinessIdeas",
                        principalColumn: "IdeaId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MarketAnalyses",
                columns: table => new
                {
                    MarketAnalysisId = table.Column<Guid>(type: "uuid", nullable: false),
                    IdeaId = table.Column<Guid>(type: "uuid", nullable: false),
                    BusinessType = table.Column<string>(type: "text", nullable: false),
                    CompetitorInsights = table.Column<string>(type: "text", nullable: false),
                    IndustryCostBenchmarks = table.Column<string>(type: "text", nullable: false),
                    MarketTrends = table.Column<string>(type: "text", nullable: false),
                    MarketSize = table.Column<string>(type: "text", nullable: false),
                    Recommendations = table.Column<string>(type: "text", nullable: true),
                    GeneratedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MarketAnalyses", x => x.MarketAnalysisId);
                    table.ForeignKey(
                        name: "FK_MarketAnalyses_BusinessIdeas_IdeaId",
                        column: x => x.IdeaId,
                        principalTable: "BusinessIdeas",
                        principalColumn: "IdeaId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BusinessIdeas_UserId",
                table: "BusinessIdeas",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Evaluations_IdeaId",
                table: "Evaluations",
                column: "IdeaId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FinancialPlans_IdeaId",
                table: "FinancialPlans",
                column: "IdeaId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MarketAnalyses_IdeaId",
                table: "MarketAnalyses",
                column: "IdeaId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_Email",
                table: "Users",
                column: "Email",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Evaluations");

            migrationBuilder.DropTable(
                name: "FinancialPlans");

            migrationBuilder.DropTable(
                name: "MarketAnalyses");

            migrationBuilder.DropTable(
                name: "BusinessIdeas");

            migrationBuilder.DropTable(
                name: "Users");
        }
    }
}
