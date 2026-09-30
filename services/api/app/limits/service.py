"""Rate limiting, spend tracking, and runaway loop detection for AI agents."""

import hashlib
import json
import time
from typing import Any, NamedTuple
from uuid import UUID

from redis.asyncio import Redis

from app.core.config import settings
from app.policy.schemas import PolicyLimit


class LimitCheckResult(NamedTuple):
    allowed: bool
    reason: str | None = None
    limit_id: str | None = None
    current_value: float = 0.0
    threshold: float = 0.0
    degraded: bool = False


def canonical_json(data: Any) -> str:
    """Serialize data to a deterministic, compact JSON string without whitespace."""
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def compute_call_signature(agent_id: UUID | str, tool: str, args: dict[str, Any]) -> str:
    """
    Compute a stable SHA-256 signature for a tool call.
    Used to detect runaway agent loops repeating identical calls.
    """
    canonical_args = canonical_json(args)
    raw = f"{agent_id}:{tool}:{canonical_args}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class InMemoryLimitTracker:
    """Thread-safe in-memory fallback for limits when Redis is not active."""

    def __init__(self) -> None:
        self._minute_calls: dict[str, tuple[int, int]] = {}  # key -> (minute_window, count)
        self._repeat_calls: dict[str, tuple[float, int]] = {}  # key -> (timestamp, count)
        self._daily_spend: dict[str, tuple[int, float]] = {}  # key -> (day_window, total)

    def check_and_increment(
        self,
        agent_id: str,
        signature: str,
        limit: PolicyLimit,
        spend_amount: float = 0.0,
    ) -> LimitCheckResult:
        now = time.time()
        current_minute = int(now // 60)
        current_day = int(now // 86400)

        # 1. Calls per minute
        if limit.max_calls_per_min is not None:
            min_key = f"{agent_id}:{limit.id}"
            window, count = self._minute_calls.get(min_key, (current_minute, 0))
            if window != current_minute:
                count = 0
                window = current_minute
            count += 1
            self._minute_calls[min_key] = (window, count)

            if count > limit.max_calls_per_min:
                return LimitCheckResult(
                    allowed=False,
                    reason=f"Rate limit exceeded: max {limit.max_calls_per_min} calls/min reached",
                    limit_id=limit.id,
                    current_value=float(count),
                    threshold=float(limit.max_calls_per_min),
                )

        # 2. Repeated identical call signature (runaway loop detection)
        if limit.max_repeat_same_call is not None:
            sig_key = f"{agent_id}:{signature}"
            last_ts, count = self._repeat_calls.get(sig_key, (now, 0))
            if now - last_ts > 60:
                count = 0
            count += 1
            self._repeat_calls[sig_key] = (now, count)

            if count > limit.max_repeat_same_call:
                return LimitCheckResult(
                    allowed=False,
                    reason=(
                        f"Loop detected: call repeated {count} times "
                        f"(max allowed: {limit.max_repeat_same_call})"
                    ),
                    limit_id=limit.id,
                    current_value=float(count),
                    threshold=float(limit.max_repeat_same_call),
                )

        # 3. Daily spend in INR
        if limit.max_spend_inr_per_day is not None and spend_amount > 0:
            spend_key = f"{agent_id}:{limit.id}"
            day_window, total = self._daily_spend.get(spend_key, (current_day, 0.0))
            if day_window != current_day:
                total = 0.0
                day_window = current_day
            total += spend_amount
            self._daily_spend[spend_key] = (day_window, total)

            if total > limit.max_spend_inr_per_day:
                return LimitCheckResult(
                    allowed=False,
                    reason=(
                        f"Daily spend cap exceeded: ₹{total:.2f} > "
                        f"₹{limit.max_spend_inr_per_day:.2f}"
                    ),
                    limit_id=limit.id,
                    current_value=total,
                    threshold=float(limit.max_spend_inr_per_day),
                )

        return LimitCheckResult(allowed=True)


in_memory_tracker = InMemoryLimitTracker()


async def check_limits(
    redis: Redis | None,
    agent_id: UUID | str,
    tool: str,
    args: dict[str, Any],
    limits: list[PolicyLimit],
    spend_amount: float = 0.0,
) -> LimitCheckResult:
    """
    Check all defined limits for an agent call.
    Uses Redis when connected, falling back to in-memory tracking.
    If Redis is unavailable and LIMITS_FAIL_CLOSED is True, fails closed.
    """
    agent_str = str(agent_id)
    sig = compute_call_signature(agent_str, tool, args)
    is_degraded = False

    for limit in limits:
        if limit.per != "agent":
            continue

        if redis is not None:
            try:
                now = time.time()
                minute_ts = int(now // 60)
                day_ts = int(now // 86400)

                # 1. Rate limit (calls/min)
                if limit.max_calls_per_min is not None:
                    k = f"prahari:limit:rate:{agent_str}:{limit.id}:{minute_ts}"
                    count = await redis.incr(k)
                    if count == 1:
                        await redis.expire(k, 65)
                    if count > limit.max_calls_per_min:
                        return LimitCheckResult(
                            allowed=False,
                            reason=f"Rate limit exceeded: max {limit.max_calls_per_min} calls/min",
                            limit_id=limit.id,
                            current_value=float(count),
                            threshold=float(limit.max_calls_per_min),
                            degraded=False,
                        )

                # 2. Loop detection (repeat same call signature)
                if limit.max_repeat_same_call is not None:
                    k = f"prahari:limit:repeat:{agent_str}:{sig}"
                    repeat_count = await redis.incr(k)
                    if repeat_count == 1:
                        await redis.expire(k, 60)
                    if repeat_count > limit.max_repeat_same_call:
                        return LimitCheckResult(
                            allowed=False,
                            reason=f"Loop detected: call repeated {repeat_count} times",
                            limit_id=limit.id,
                            current_value=float(repeat_count),
                            threshold=float(limit.max_repeat_same_call),
                            degraded=False,
                        )

                # 3. Daily spend limit
                if limit.max_spend_inr_per_day is not None and spend_amount > 0:
                    k = f"prahari:limit:spend:{agent_str}:{limit.id}:{day_ts}"
                    total_spend = float(await redis.incrbyfloat(k, spend_amount))
                    if total_spend == spend_amount:
                        await redis.expire(k, 86460)
                    if total_spend > limit.max_spend_inr_per_day:
                        return LimitCheckResult(
                            allowed=False,
                            reason=(
                                f"Daily budget exceeded: ₹{total_spend:.2f} > "
                                f"₹{limit.max_spend_inr_per_day:.2f}"
                            ),
                            limit_id=limit.id,
                            current_value=total_spend,
                            threshold=float(limit.max_spend_inr_per_day),
                            degraded=False,
                        )
                continue
            except Exception:
                # If Redis operation fails, mark degraded and fall back
                is_degraded = True
                if settings.LIMITS_FAIL_CLOSED:
                    return LimitCheckResult(
                        allowed=False,
                        reason="limits_service_unavailable",
                        limit_id=limit.id,
                        degraded=True,
                    )
        else:
            is_degraded = True
            if settings.LIMITS_FAIL_CLOSED:
                return LimitCheckResult(
                    allowed=False,
                    reason="limits_service_unavailable",
                    limit_id=limit.id,
                    degraded=True,
                )

        # Fallback to in-memory tracker
        result = in_memory_tracker.check_and_increment(agent_str, sig, limit, spend_amount)
        if not result.allowed:
            return LimitCheckResult(
                allowed=False,
                reason=result.reason,
                limit_id=result.limit_id,
                current_value=result.current_value,
                threshold=result.threshold,
                degraded=is_degraded,
            )

    return LimitCheckResult(allowed=True, degraded=is_degraded)
