"""Prompt injection detection stub with clean interface."""

import re
from typing import Any

# Basic heuristic patterns for detecting prompt injection in tool outputs/context
INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(all\s+)?(previous|prior)\s+instructions?", re.IGNORECASE),
    re.compile(r"system\s+prompt\s*:", re.IGNORECASE),
    re.compile(r"override\s+(the\s+)?policy", re.IGNORECASE),
    re.compile(r"export\s+all\s+(customers?|users?|data)", re.IGNORECASE),
    re.compile(r"disregard\s+guardrails?", re.IGNORECASE),
    re.compile(r"you\s+are\s+now\s+in\s+developer\s+mode", re.IGNORECASE),
]


def scan_injection(context: dict[str, Any] | None) -> float:
    """
    Scan inbound context and attached tool outputs for prompt injection patterns.
    Returns an injection risk score between 0.0 (benign) and 1.0 (malicious).
    """
    if not context:
        return 0.0

    # Extract all text from context and tool outputs
    texts: list[str] = []

    def extract_text(item: Any) -> None:
        if isinstance(item, str):
            texts.append(item)
        elif isinstance(item, dict):
            for v in item.values():
                extract_text(v)
        elif isinstance(item, (list, tuple)):
            for v in item:
                extract_text(v)

    extract_text(context)
    combined = " ".join(texts)
    if not combined.strip():
        return 0.0

    score = 0.0
    for pattern in INJECTION_PATTERNS:
        if pattern.search(combined):
            score += 0.45

    return min(score, 1.0)
