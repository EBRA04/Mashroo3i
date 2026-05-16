# Mashroo3i — Rebuild (Learning Project)

A business idea evaluation platform built with .NET 8 + React + PostgreSQL.
This repo is rebuilt from scratch as a learning project for full-stack (backend-focused) development.

## Tech Stack
| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router, Axios |
| Backend | .NET 8 Web API, EF Core, JWT |
| Database | PostgreSQL |
| AI | Anthropic Claude API |

---

## Project Structure
```
Mashroo3i/
├── backend/          ← .NET 8 Web API
│   ├── Controllers/  ← HTTP endpoints (what URLs the API exposes)
│   ├── Models/       ← Database tables (C# classes)
│   ├── DTOs/         ← What the API accepts and returns
│   ├── Data/         ← AppDbContext (EF Core bridge to PostgreSQL)
│   ├── Services/     ← Business logic (kept separate from controllers)
│   └── Program.cs    ← App entry point and configuration
└── frontend/         ← React app
    └── src/
        ├── pages/    ← One file per page
        ├── components/ ← Reusable UI pieces
        └── services/ ← API call functions (axios)
```

---

## Git Workflow — READ THIS FIRST

### Branch structure
```
main        ← production-ready only. Never push here directly.
dev         ← integration branch. Merge your features here first.
feature/xxx ← your feature branch. One branch per task.
```

### Step-by-step for every task
```bash
# 1. Always start from dev
git checkout dev
git pull origin dev

# 2. Create your feature branch
git checkout -b feature/your-task-name

# 3. Write your code, commit often
git add .
git commit -m "feat: short description of what you did"

# 4. Push your branch
git push origin feature/your-task-name

# 5. Open a Pull Request → dev (NOT main)
# 6. Partner reviews your PR, leaves comments
# 7. Fix comments, then merge
```

### Commit message format
```
feat: add user registration endpoint
fix: return 404 when idea not found
refactor: move JWT logic into AuthService
chore: add EF Core migration for Users table
```

---

## Task Breakdown

> **Partner A** = Abdallah
> **Partner B** = Ibrahim
> Each task = one branch = one PR

---

### MILESTONE 1 — Database & Auth (Week 1-2)

#### Partner A: Models + Database Setup
Branch: `feature/database-setup`

**Your job:**
1. Create `Models/User.cs` — properties: Id, Name, Email, PasswordHash, CreatedAt
2. Create `Models/BusinessIdea.cs` — properties: Id, Title, Description, Sector, Budget, CreatedAt, UserId (foreign key)
3. Create `Models/Evaluation.cs` — properties: Id, OverallScore, NoveltyScore, MarketScore, RiskLevel, Verdict, Recommendations, SwotJson, GeneratedAt, BusinessIdeaId (foreign key)
4. Create `Data/AppDbContext.cs` — register all 3 models as DbSets, configure relationships
5. Run: `dotnet ef migrations add InitialCreate`
6. Run: `dotnet ef database update`

**What you'll learn:**
- How C# classes map to database tables
- What a foreign key is and why it exists
- How EF Core migrations generate SQL from your C# code

**Test it works:** Open pgAdmin → your database → Tables → you should see `Users`, `Ideas`, `Evaluations`

---

#### Partner B: JWT Auth Endpoints
Branch: `feature/auth-endpoints`

**Your job:**
1. Create `DTOs/Auth/RegisterDto.cs` — Name, Email, Password (with validation attributes)
2. Create `DTOs/Auth/LoginDto.cs` — Email, Password
3. Create `DTOs/Auth/AuthResponseDto.cs` — Token, UserId, Name, Email
4. Create `Services/AuthService.cs` with two methods:
   - `RegisterAsync(RegisterDto dto)` → hash password with BCrypt, save to DB, return JWT
   - `LoginAsync(LoginDto dto)` → verify password with BCrypt, return JWT
5. Create `Controllers/AuthController.cs` with:
   - `POST /api/auth/register`
   - `POST /api/auth/login`
   - `GET /api/auth/me` (requires `[Authorize]`)
6. Wire up JWT in `Program.cs`

**What you'll learn:**
- Why we never store plain passwords (BCrypt)
- What a JWT is and how it works (header.payload.signature)
- What `[Authorize]` does and how ASP.NET validates the token
- Dependency Injection — why AuthService is injected, not `new`-ed

**Test it works:** Use Postman:
- `POST /api/auth/register` with `{ "name": "Test", "email": "test@test.com", "password": "123456" }` → should return a token
- `POST /api/auth/login` with same email/password → should return a token
- `GET /api/auth/me` with `Authorization: Bearer <token>` → should return user info

---

### MILESTONE 2 — Ideas CRUD (Week 2-3)

#### Partner A: Ideas Endpoints
Branch: `feature/ideas-endpoints`

**Your job:**
1. Create `DTOs/Ideas/CreateIdeaDto.cs` — Title, Description, Sector, Budget
2. Create `DTOs/Ideas/IdeaResponseDto.cs` — all fields + HasEvaluation (bool)
3. Create `Controllers/IdeasController.cs` with:
   - `POST /api/ideas` — create idea, link to logged-in user
   - `GET /api/ideas` — get all ideas for the logged-in user only
   - `GET /api/ideas/{id}` — get one idea (only if it belongs to you)
   - `DELETE /api/ideas/{id}` — delete (only if it belongs to you)

**What you'll learn:**
- How to get the current user's ID from the JWT (`User.FindFirst(ClaimTypes.NameIdentifier)`)
- Why we check ownership before returning/deleting data (security)
- The difference between 401 (not authenticated) and 403 (authenticated but not allowed)

**Test it works:**
- Create an idea (logged in) → 201 Created
- Get all ideas → only sees your ideas, not someone else's
- Try to delete another user's idea → 403 Forbidden

---

#### Partner B: Program.cs + CORS + Middleware
Branch: `feature/program-setup`

**Your job:**
1. Complete `Program.cs`:
   - Add PostgreSQL connection (`AddDbContext`)
   - Add JWT authentication (`AddAuthentication`, `AddJwtBearer`)
   - Add CORS policy (allow `http://localhost:5173` — the React dev server)
   - Add `UseAuthentication()` and `UseAuthorization()` middleware
2. Create `backend/appsettings.json` with placeholder keys:
   ```json
   {
     "ConnectionStrings": { "DefaultConnection": "YOUR_DB_URL" },
     "Jwt": { "Key": "YOUR_SECRET_KEY", "Issuer": "mashroo3i" },
     "Anthropic": { "ApiKey": "YOUR_ANTHROPIC_KEY" }
   }
   ```
3. Create `backend/appsettings.Development.json` (gitignored) with real local values

**What you'll learn:**
- What middleware is and why order matters (`UseAuthentication` must come before `UseAuthorization`)
- What CORS is and why the browser blocks requests without it
- Why secrets go in environment variables, not in the repo

---

### MILESTONE 3 — AI Evaluation (Week 3-4)

#### Partner A: AI Service
Branch: `feature/evaluation-service`

**Your job:**
1. Create `Services/EvaluationService.cs` that:
   - Takes a `BusinessIdea` object
   - Builds a prompt string with the idea details
   - Calls the Anthropic Claude API using `HttpClient`
   - Parses the JSON response
   - Returns a filled `Evaluation` model
2. Register `HttpClient` in `Program.cs`

**The prompt to use:**
```
You are a business analyst for the Amman, Jordan market.
Evaluate this business idea and return ONLY valid JSON.

Idea: {title}
Description: {description}
Sector: {sector}
Budget: {budget} JOD

Return this exact JSON structure:
{
  "overallScore": <number 1-100>,
  "noveltyScore": <number 1-100>,
  "marketScore": <number 1-100>,
  "riskLevel": "Low" or "Medium" or "High",
  "verdict": "<one honest sentence>",
  "recommendations": "<3 specific action steps>",
  "swot": {
    "strengths": ["...", "..."],
    "weaknesses": ["...", "..."],
    "opportunities": ["...", "..."],
    "threats": ["...", "..."]
  }
}
```

**What you'll learn:**
- How to call an external HTTP API from .NET
- How to deserialize JSON with `System.Text.Json`
- Prompt engineering basics

---

#### Partner B: Evaluation Endpoints
Branch: `feature/evaluation-endpoints`

**Your job:**
1. Create `DTOs/Evaluation/EvaluationResponseDto.cs`
2. Create `Controllers/EvaluationController.cs` with:
   - `POST /api/evaluation/{ideaId}` — call EvaluationService, save result to DB
   - `GET /api/evaluation/{ideaId}` — return saved evaluation (404 if not generated yet)

**What you'll learn:**
- How controllers call services (Dependency Injection)
- Returning proper HTTP status codes (201 Created, 404 Not Found, 200 OK)
- Checking idea ownership before generating an evaluation

---

### MILESTONE 4 — Frontend (Week 4-6)

Split pages between both partners. Each page = one branch.

| Page | Partner | Branch |
|---|---|---|
| Login + Register forms | A | `feature/frontend-auth` |
| Dashboard (list of ideas) | B | `feature/frontend-dashboard` |
| Submit Idea form | A | `feature/frontend-submit` |
| Evaluation results page | B | `feature/frontend-evaluation` |
| Navbar + Protected Routes | Both | `feature/frontend-layout` |

**Each page should:**
1. Call the real backend API (no fake data)
2. Show a loading state while waiting
3. Show an error message if the call fails
4. Work on mobile (basic responsive)

---

### MILESTONE 5 — Deploy (Week 6)

Both partners do this together:
1. Deploy backend to **Railway** (free)
2. Deploy frontend to **Vercel** (free)
3. Connect frontend's `VITE_API_URL` to Railway backend URL
4. Test the full flow on the live URL

---

## How to Run Locally

### Backend
```bash
cd backend
# Create appsettings.Development.json with your DB connection string
dotnet run
# API runs at https://localhost:5001
```

### Frontend
```bash
cd frontend
npm run dev
# App runs at http://localhost:5173
```

### Database
```bash
# After adding a migration:
dotnet ef migrations add <MigrationName>
dotnet ef database update
```

---

## Code Review Checklist

Before approving a PR, check:
- [ ] Does the endpoint return the correct HTTP status code?
- [ ] Is user ownership checked before accessing/modifying data?
- [ ] Are secrets hardcoded anywhere? (should be 0)
- [ ] Does it handle the case where data is not found?
- [ ] Can you understand what each method does by reading it?

---

## Resources

| Topic | Resource |
|---|---|
| C# basics | https://dotnet.microsoft.com/en-us/learn/dotnet/hello-world-tutorial |
| EF Core | https://learn.microsoft.com/en-us/ef/core/get-started |
| JWT explained | https://jwt.io/introduction |
| REST API design | https://restfulapi.net |
| React basics | https://react.dev/learn |
| Git workflow | https://www.atlassian.com/git/tutorials/comparing-workflows/feature-branch-workflow |
