using Mashroo3i.DTOs.BusinessIdea;
using Mashroo3i.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Mashroo3i.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class BusinessIdeaController : ControllerBase
    {
        private readonly BusinessIdeaService _service;

        public BusinessIdeaController(BusinessIdeaService service)
        {
            _service = service;
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateBusinessIdeaDto dto)
        {
            var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (userIdClaim == null) return Unauthorized();

            var userId = Guid.Parse(userIdClaim);
            var idea = await _service.CreateAsync(dto, userId);

            return CreatedAtAction(nameof(Create), new { id = idea.IdeaId }, new
            {
                idea.IdeaId,
                idea.Title,
                idea.Status
            });
        }
    }
}