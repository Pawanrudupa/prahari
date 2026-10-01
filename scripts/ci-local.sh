#!/usr/bin/env bash
# scripts/ci-local.sh
# Mirrors GitHub Actions .github/workflows/ci.yml exactly for local reproduction.
set -euo pipefail

echo "============================================================"
echo "Prahari Local CI Runner (Bash)"
echo "============================================================"

# 1. Verify Docker Engine is running
echo "[1/8] Verifying Docker Engine..."
if ! docker info >/dev/null 2>&1; then
    echo "ERROR: Docker engine is not running or unreachable. Please launch Docker Desktop and retry." >&2
    exit 1
fi
echo "Docker engine is running."

# 2. Spin up Postgres 16 (pgvector) and Redis 7 service containers
echo "[2/8] Ensuring Postgres 16 (pgvector) + Redis 7 are running via docker compose..."
docker compose up -d postgres redis

# Wait for healthy status
echo "Waiting for database and redis healthchecks..."
MAX_ATTEMPTS=30
ATTEMPTS=0
HEALTHY=0
while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
    PG_HEALTH=$(docker inspect --format='{{json .State.Health.Status}}' prahari-postgres-1 2>/dev/null | tr -d '"' || true)
    RD_HEALTH=$(docker inspect --format='{{json .State.Health.Status}}' prahari-redis-1 2>/dev/null | tr -d '"' || true)
    if [ "$PG_HEALTH" = "healthy" ] && [ "$RD_HEALTH" = "healthy" ]; then
        HEALTHY=1
        break
    fi
    sleep 1
    ATTEMPTS=$((ATTEMPTS + 1))
done

if [ $HEALTHY -ne 1 ]; then
    echo "ERROR: Containers did not become healthy in time. Postgres: $PG_HEALTH, Redis: $RD_HEALTH" >&2
    exit 1
fi
echo "Postgres & Redis are healthy."

# 3. Export exact CI environment variables
export DATABASE_URL="postgresql+asyncpg://prahari:prahari@localhost:5432/prahari"
export REDIS_URL="redis://localhost:6379/0"
export REQUIRE_POSTGRES="true"
export ADMIN_TOKEN="ci-admin-token-super-secret-key-32chars"
export AUDIT_HMAC_KEY="ci-audit-checkpoint-hmac-secret-key-32chars"
export SESSION_SECRET_KEY="ci-session-secret-key-super-secret-32chars"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 4. API: Lint, Type-check, Alembic migrations, Pytest, Latency Benchmark
echo "[3/8] API: Installing dependencies (services/api)..."
cd "$REPO_ROOT/services/api"
uv sync --extra dev

echo "[4/8] API: Ruff lint and Mypy strict type-checking..."
uv run ruff check .
uv run mypy .

echo "[5/8] API: Running Alembic migrations against real Postgres..."
uv run alembic upgrade head

echo "[6/8] API: Running pytest against real Postgres & Redis..."
uv run pytest -v --tb=short -rA

echo "[7/8] API: Running Gateway Latency Benchmark (Target: p95 < 50ms)..."
uv run python benchmarks/bench_gateway.py

# 5. Web: Install, Type-check, Test, and Build
echo "[8/8] Web: Type-check, test, and build (apps/web)..."
cd "$REPO_ROOT/apps/web"
pnpm type-check
pnpm test
pnpm build

echo "============================================================"
echo "SUCCESS: All CI checks (API + Web) passed locally!"
echo "============================================================"
exit 0
