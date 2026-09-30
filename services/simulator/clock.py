"""Injectable deterministic simulation clock for reproducible runs."""

from datetime import UTC, datetime, timedelta


class SimulationClock:
    """Injectable virtual clock that advances deterministically."""

    def __init__(self, start_time: datetime | None = None, step_seconds: float = 1.0) -> None:
        self.initial_time = start_time or datetime(2026, 9, 30, 12, 0, 0, tzinfo=UTC)
        self.current = self.initial_time
        self.step = timedelta(seconds=step_seconds)

    def reset(self) -> None:
        """Reset virtual clock back to initial start time."""
        self.current = self.initial_time

    def tick(self) -> str:
        """Advance time by step_seconds and return ISO-8601 string."""
        now_str = self.current.isoformat()
        self.current += self.step
        return now_str

    def now_iso(self) -> str:
        """Return current virtual time without advancing."""
        return self.current.isoformat()
