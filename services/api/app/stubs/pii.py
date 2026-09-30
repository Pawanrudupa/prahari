"""PII detection and redaction stub with clean interface."""

import re
from typing import Any

# Regular expressions for Indian and common PII patterns
PATTERNS = {
    "pan": re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b"),
    "aadhaar": re.compile(r"\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b"),
    "phone": re.compile(r"(?:\+91[\-\s]?)?[6-9]\d{9}\b"),
    "email": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"),
}


def detect_pii(args: dict[str, Any]) -> list[str]:
    """
    Detect personal data classes in arguments.
    Returns detected data class labels only (e.g. ['aadhaar', 'pan']).
    Never returns or logs raw values.
    """
    detected: set[str] = set()

    def inspect_value(val: Any) -> None:
        if isinstance(val, str):
            for label, pattern in PATTERNS.items():
                if pattern.search(val):
                    detected.add(label)
        elif isinstance(val, dict):
            for k, v in val.items():
                # Also check key names for semantic hints
                k_lower = k.lower()
                for label in ("pan", "aadhaar", "phone", "email"):
                    if label in k_lower:
                        detected.add(label)
                inspect_value(v)
        elif isinstance(val, (list, tuple)):
            for item in val:
                inspect_value(item)

    inspect_value(args)
    return sorted(detected)


def redact_args(args: dict[str, Any], fields_to_redact: list[str]) -> dict[str, Any]:
    """
    Return a deep copy of args where values matching data class names
    or specified field names are masked with '[REDACTED]'.
    """
    redact_set = {f.lower() for f in fields_to_redact}

    def sanitize(item: Any, key_name: str | None = None) -> Any:
        # Check if the key matches a redaction target
        if key_name and key_name.lower() in redact_set:
            return "[REDACTED]"

        if isinstance(item, dict):
            return {k: sanitize(v, k) for k, v in item.items()}

        if isinstance(item, list):
            return [sanitize(elem, key_name) for elem in item]

        if isinstance(item, str):
            # Check if value matches any pattern targeted for redaction
            masked_str = item
            for label in redact_set:
                pat = PATTERNS.get(label)
                if pat:
                    masked_str = pat.sub("[REDACTED]", masked_str)
            return masked_str

        return item

    return sanitize(args)  # type: ignore[no-any-return]
