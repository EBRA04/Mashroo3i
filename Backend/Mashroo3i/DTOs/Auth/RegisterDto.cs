using System.ComponentModel.DataAnnotations;
namespace Mashroo3i.DTOs.Auth { 
public class RegisterDto
{
    [Required, MaxLength(100)]
    public string FullName { get; set; } = string.Empty;

    [Required, EmailAddress, MaxLength(255)]
    public string Email { get; set; } = string.Empty;

    [Required, MinLength(8), MaxLength(100)]
    public string Password { get; set; } = string.Empty;

    [Required,MaxLength(100)]
    public string? Education { get; set; }

    [Required,MaxLength(100)]
    public string? Experience { get; set; }

    [Required,MaxLength(100)]
    public string? BusinessInterest { get; set; }
}
}