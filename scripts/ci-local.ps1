# scripts/ci-local.ps1
# Mirrors GitHub Actions .github/workflows/ci.yml exactly for local reproduction.
$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Prahari Local CI Runner (PowerShell)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Verify Docker Engine is running
Write-Host "[1/8] Verifying Docker Engine..." -ForegroundColor Yellow
try {
    $dockerInfo = docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Docker engine check failed"
    }
} catch {
    Write-Error "ERROR: Docker engine is not running or unreachable. Please launch Docker Desktop and retry."
    exit 1
}
Write-Host "Docker engine is running." -ForegroundColor Green

# 2. Spin up Postgres 16 (pgvector) and Redis 7 service containers
Write-Host "[2/8] Ensuring Postgres 16 (pgvector) + Redis 7 are running via docker compose..." -ForegroundColor Yellow
docker compose up -d postgres redis
if ($LASTEXITCODE -ne 0) {
    Write-Error "ERROR: Failed to start docker compose dependencies."
    exit 1
}

# Wait for healthy status
Write-Host "Waiting for database and redis healthchecks..." -ForegroundColor Yellow
$maxAttempts = 30
$attempts = 0
$healthy = $false
while ($attempts -lt $maxAttempts) {
    $pgHealth = (docker inspect --format='{{json .State.Health.Status}}' prahari-postgres-1 2>$null) -replace '"',''
    $rdHealth = (docker inspect --format='{{json .State.Health.Status}}' prahari-redis-1 2>$null) -replace '"',''
    if ($pgHealth -eq "healthy" -and $rdHealth -eq "healthy") {
        $healthy = $true
        break
    }
    Start-Sleep -Seconds 1
    $attempts++
}

if (-not $healthy) {
    Write-Error "ERROR: Containers did not become healthy in time. Postgres: $pgHealth, Redis: $rdHealth"
    exit 1
}
Write-Host "Postgres & Redis are healthy." -ForegroundColor Green

# 3. Export exact CI environment variables
$env:DATABASE_URL = "postgresql+asyncpg://prahari:prahari@localhost:5432/prahari"
$env:REDIS_URL = "redis://localhost:6379/0"
$env:REQUIRE_POSTGRES = "true"
$env:ADMIN_TOKEN = "ci-admin-token-super-secret-key-32chars"
$env:AUDIT_HMAC_KEY = "ci-audit-checkpoint-hmac-secret-key-32chars"
$env:SESSION_SECRET_KEY = "ci-session-secret-key-super-secret-32chars"

$repoRoot = (Get-Item $PSScriptRoot).Parent.FullName

# 4. API: Lint (ruff) and Type-check (mypy)
Write-Host "[3/8] API: Installing dependencies and linting (services/api)..." -ForegroundColor Yellow
Push-Location "$repoRoot/services/api"
try {
    uv sync --extra dev
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "[4/8] API: Ruff lint and Mypy strict type-checking..." -ForegroundColor Yellow
    uv run ruff check .
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    uv run mypy .
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    # 5. API: Alembic migrations
    Write-Host "[5/8] API: Running Alembic migrations against real Postgres..." -ForegroundColor Yellow
    uv run alembic upgrade head
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    # 6. API: Pytest test suite
    Write-Host "[6/8] API: Running pytest against real Postgres & Redis..." -ForegroundColor Yellow
    uv run pytest -v --tb=short -rA
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    # 7. API: Latency Benchmark
    Write-Host "[7/8] API: Running Gateway Latency Benchmark (Target: p95 < 50ms)..." -ForegroundColor Yellow
    uv run python benchmarks/bench_gateway.py
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}

# 8. Web: Install, Type-check, Test, and Build
Write-Host "[8/8] Web: Type-check, test, and build (apps/web)..." -ForegroundColor Yellow
Push-Location "$repoRoot/apps/web"
try {
    pnpm type-check
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    pnpm test
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    pnpm build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}

Write-Host "============================================================" -ForegroundColor Green
Write-Host "SUCCESS: All CI checks (API + Web) passed locally!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
exit 0
