"""Section-aware sliding-window chunker for policy documents.

Guarantees:
- Never emits heading-only chunks (merges headings with their body content).
- Prepends hierarchical parent heading path to section_title (e.g. "Section 2 > 2.1").
- Bounded sliding window if a section exceeds target size.
- Computes SHA-256 for exact chunk deduplication and snapshot tracking.
"""

from __future__ import annotations

import hashlib
import re
from typing import TypedDict


class ChunkItem(TypedDict):
    chunk_index: int
    section_title: str | None
    text: str
    checksum_sha256: str
    meta: dict[str, int | str | None]


# Matches markdown headers like # Section 1 ..., ## Section 2.1 ..., or # Scope
_HEADING_REGEX = re.compile(r"^(#{1,4})\s+(.+)$", re.MULTILINE)

DEFAULT_CHUNK_SIZE_CHARS = 1200
DEFAULT_CHUNK_OVERLAP_CHARS = 150


def _build_hierarchical_title(stack: list[tuple[int, str]]) -> str:
    """Build section title path from heading hierarchy stack (e.g. 'Section 2 > 2.1')."""
    if not stack:
        return "General"
    if len(stack) == 1:
        return stack[0][1]

    parts: list[str] = [stack[0][1]]
    for idx in range(1, len(stack)):
        title = stack[idx][1]
        # If subsection starts with Section X.Y, extract label
        sub_match = re.match(r"^Section\s+([0-9]+(?:\.[0-9]+)*)(?:\s+(.*))?$", title, re.IGNORECASE)
        parent_match = re.match(r"^Section\s+([0-9]+)", stack[idx - 1][1], re.IGNORECASE)
        if sub_match and parent_match:
            sub_num = sub_match.group(1)
            sub_rest = sub_match.group(2) or ""
            parts.append(f"{sub_num} {sub_rest}".strip())
        else:
            parts.append(title)

    return " > ".join(parts)


def chunk_document(
    text: str,
    target_size: int = DEFAULT_CHUNK_SIZE_CHARS,
    overlap: int = DEFAULT_CHUNK_OVERLAP_CHARS,
) -> list[ChunkItem]:
    """
    Split a policy document into section-aware chunks.

    Never emits heading-only chunks; merges heading text with following body.
    Prepends parent heading hierarchy to each chunk's section_title.
    """
    cleaned = text.strip()
    if not cleaned:
        return []

    heading_matches = list(_HEADING_REGEX.finditer(cleaned))
    if not heading_matches:
        sha = hashlib.sha256(cleaned.encode("utf-8")).hexdigest()
        return [
            ChunkItem(
                chunk_index=0,
                section_title="Preamble",
                text=cleaned,
                checksum_sha256=sha,
                meta={"char_length": len(cleaned), "section": "Preamble"},
            )
        ]

    heading_stack: list[tuple[int, str]] = []
    raw_sections: list[tuple[str, str]] = []

    first_heading = heading_matches[0]
    if first_heading.start() > 0:
        preamble_text = cleaned[: first_heading.start()].strip()
        if preamble_text:
            raw_sections.append(("Preamble", preamble_text))

    for idx, match in enumerate(heading_matches):
        level = len(match.group(1))
        heading_title = match.group(2).strip()

        while heading_stack and heading_stack[-1][0] >= level:
            heading_stack.pop()
        heading_stack.append((level, heading_title))

        current_hierarchical_title = _build_hierarchical_title(heading_stack)

        line_end = cleaned.find("\n", match.end())
        content_start = line_end + 1 if line_end != -1 else match.end()
        content_end = (
            heading_matches[idx + 1].start() if idx + 1 < len(heading_matches) else len(cleaned)
        )

        body = cleaned[content_start:content_end].strip()

        # INVARIANT: Never emit heading-only chunks.
        if not body:
            continue

        merged_text = f"{match.group(0).strip()}\n\n{body}"
        raw_sections.append((current_hierarchical_title, merged_text))

    if not raw_sections:
        sha = hashlib.sha256(cleaned.encode("utf-8")).hexdigest()
        return [
            ChunkItem(
                chunk_index=0,
                section_title="General",
                text=cleaned,
                checksum_sha256=sha,
                meta={"char_length": len(cleaned), "section": "General"},
            )
        ]

    chunks: list[ChunkItem] = []
    global_index = 0

    for sec_title, sec_content in raw_sections:
        if len(sec_content) <= target_size:
            sha = hashlib.sha256(sec_content.encode("utf-8")).hexdigest()
            chunks.append(
                ChunkItem(
                    chunk_index=global_index,
                    section_title=sec_title,
                    text=sec_content,
                    checksum_sha256=sha,
                    meta={"char_length": len(sec_content), "section": sec_title},
                )
            )
            global_index += 1
        else:
            paragraphs = sec_content.split("\n\n")
            current_parts: list[str] = []
            current_len = 0

            for para in paragraphs:
                para_clean = para.strip()
                if not para_clean:
                    continue

                if current_len + len(para_clean) > target_size and current_parts:
                    chunk_text = "\n\n".join(current_parts)
                    sha = hashlib.sha256(chunk_text.encode("utf-8")).hexdigest()
                    chunks.append(
                        ChunkItem(
                            chunk_index=global_index,
                            section_title=sec_title,
                            text=chunk_text,
                            checksum_sha256=sha,
                            meta={"char_length": len(chunk_text), "section": sec_title},
                        )
                    )
                    global_index += 1
                    current_parts = [para_clean]
                    current_len = len(para_clean)
                else:
                    current_parts.append(para_clean)
                    current_len += len(para_clean) + 2

            if current_parts:
                chunk_text = "\n\n".join(current_parts)
                sha = hashlib.sha256(chunk_text.encode("utf-8")).hexdigest()
                chunks.append(
                    ChunkItem(
                        chunk_index=global_index,
                        section_title=sec_title,
                        text=chunk_text,
                        checksum_sha256=sha,
                        meta={"char_length": len(chunk_text), "section": sec_title},
                    )
                )
                global_index += 1

    return chunks
