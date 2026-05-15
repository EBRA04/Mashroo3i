using Mashroo3i.Data;
using Mashroo3i.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Mashroo3i.Controllers
{
    [ApiController]
    [Route("api/financial-plans")]
    [Authorize]
    public class FinancialPlansController : ControllerBase
    {
        private readonly AppDbContext _db;

        public FinancialPlansController(AppDbContext db)
        {
            _db = db;
        }

        // GET /api/financial-plans/{ideaId}
        // Returns saved plan inputs or 404 if none saved yet
        [HttpGet("{ideaId:guid}")]
        public async Task<IActionResult> Get(Guid ideaId)
        {
            var userId = GetUserId();
            if (userId == null) return Unauthorized();

            // Make sure the idea belongs to this user
            var idea = await _db.BusinessIdeas
                .FirstOrDefaultAsync(i => i.IdeaId == ideaId && i.UserId == userId.Value);

            if (idea == null) return NotFound(new { message = "Idea not found." });

            var plan = await _db.FinancialPlans
                .FirstOrDefaultAsync(f => f.IdeaId == ideaId);

            if (plan == null) return NotFound(new { message = "No financial plan saved yet." });

            return Ok(new
            {
                plan.PlanId,
                plan.IdeaId,
                plan.InitialInvestment,
                plan.MonthlyCosts,
                plan.MonthlyRevenue,
                plan.GrossMarginPct,
                TicketSize        = plan.MonthlyRevenue,   // mapped field
                CustomersPerMonth = (int?)null,            // not stored separately — frontend keeps state
                plan.CreatedAt,
            });
        }

        // POST /api/financial-plans/{ideaId}
        // Save or update (upsert) the wizard inputs for an idea
        [HttpPost("{ideaId:guid}")]
        public async Task<IActionResult> Upsert(Guid ideaId, [FromBody] SaveFinancialPlanDto dto)
        {
            var userId = GetUserId();
            if (userId == null) return Unauthorized();

            var idea = await _db.BusinessIdeas
                .FirstOrDefaultAsync(i => i.IdeaId == ideaId && i.UserId == userId.Value);

            if (idea == null) return NotFound(new { message = "Idea not found." });

            var existing = await _db.FinancialPlans
                .FirstOrDefaultAsync(f => f.IdeaId == ideaId);

            if (existing != null)
            {
                // Update
                existing.InitialInvestment = dto.CapEx;
                existing.MonthlyCosts      = dto.OpEx;
                existing.MonthlyRevenue    = dto.TicketSize * dto.CustomersPerMonth;
                existing.GrossMarginPct    = dto.GrossMargin;
            }
            else
            {
                // Create
                var plan = new FinancialProjection
                {
                    IdeaId             = ideaId,
                    InitialInvestment  = dto.CapEx,
                    MonthlyCosts       = dto.OpEx,
                    MonthlyRevenue     = dto.TicketSize * dto.CustomersPerMonth,
                    GrossMarginPct     = dto.GrossMargin,
                };
                _db.FinancialPlans.Add(plan);
            }

            await _db.SaveChangesAsync();
            return Ok(new { message = "Financial plan saved." });
        }

        private Guid? GetUserId()
        {
            var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return Guid.TryParse(claim, out var id) ? id : null;
        }
    }

    public class SaveFinancialPlanDto
    {
        public decimal CapEx             { get; set; }
        public decimal OpEx              { get; set; }
        public decimal TicketSize        { get; set; }
        public decimal CustomersPerMonth { get; set; }
        public decimal GrossMargin       { get; set; }
        public decimal MonthlyGrowth     { get; set; }
    }
}
