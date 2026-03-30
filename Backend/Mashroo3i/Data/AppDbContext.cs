using Microsoft.EntityFrameworkCore;
using Mashroo3i.Models;

namespace Mashroo3i.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options)
            : base(options) { }

        public DbSet<User> Users => Set<User>();
        public DbSet<BusinessIdea> BusinessIdeas => Set<BusinessIdea>();
        public DbSet<Evaluation> Evaluations => Set<Evaluation>();
        public DbSet<MarketAnalysis> MarketAnalyses => Set<MarketAnalysis>();
        public DbSet<FinancialPlan> FinancialPlans => Set<FinancialPlan>();

        protected override void OnModelCreating(ModelBuilder builder)
        {
            // User
            builder.Entity<User>(e =>
            {
                e.HasKey(u => u.Id);
                e.HasIndex(u => u.Email).IsUnique();
                e.Property(u => u.Email).IsRequired().HasMaxLength(255);
                e.Property(u => u.FullName).IsRequired().HasMaxLength(100);
                e.Property(u => u.Role).HasDefaultValue("Entrepreneur");
            });

            // BusinessIdea
            builder.Entity<BusinessIdea>(e =>
            {
                e.HasKey(b => b.IdeaId);
                e.HasOne(b => b.User)
                 .WithMany()
                 .HasForeignKey(b => b.UserId)
                 .OnDelete(DeleteBehavior.Cascade);
                e.Property(b => b.EstimatedBudget).HasColumnType("decimal(18,2)");
            });

            // Evaluation
            builder.Entity<Evaluation>(e =>
            {
                e.HasKey(ev => ev.EvaluationId);
                e.HasOne(ev => ev.BusinessIdea)
                 .WithOne(b => b.Evaluation)
                 .HasForeignKey<Evaluation>(ev => ev.IdeaId)
                 .OnDelete(DeleteBehavior.Cascade);
            });

            // MarketAnalysis
            builder.Entity<MarketAnalysis>(e =>
            {
                e.HasKey(m => m.MarketAnalysisId);
                e.HasOne(m => m.BusinessIdea)
                 .WithOne(b => b.MarketAnalysis)
                 .HasForeignKey<MarketAnalysis>(m => m.IdeaId)
                 .OnDelete(DeleteBehavior.Cascade);
            });

            // FinancialPlan
            builder.Entity<FinancialPlan>(e =>
            {
                e.HasKey(f => f.PlanId);
                e.HasOne(f => f.BusinessIdea)
                 .WithOne(b => b.FinancialPlan)
                 .HasForeignKey<FinancialPlan>(f => f.IdeaId)
                 .OnDelete(DeleteBehavior.Cascade);
                e.Property(f => f.InitialInvestment).HasColumnType("decimal(18,2)");
                e.Property(f => f.MonthlyRevenue).HasColumnType("decimal(18,2)");
                e.Property(f => f.MonthlyCosts).HasColumnType("decimal(18,2)");
                e.Property(f => f.MonthlyProfit).HasColumnType("decimal(18,2)");
                e.Property(f => f.RoiPercentage).HasColumnType("decimal(18,2)");
                e.Property(f => f.GrossMarginPct).HasColumnType("decimal(18,2)");
                e.Property(f => f.BreakEvenUnits).HasColumnType("decimal(18,2)");
            });
        }
    }
}