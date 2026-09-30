FROM python:3.12-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy project files
COPY pyproject.toml .
RUN uv sync --frozen --no-dev 2>/dev/null || uv sync --no-dev

COPY . .

EXPOSE 8000

# Run migrations then start server
CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000"]
