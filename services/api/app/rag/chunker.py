"""Section-aware sliding-window chunker for policy documents."""

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
_HEADING_REGEX = re.compile(r"^(#{1,3})\s+(.+)$", re.MULTILINE)

DEFAULT_CHUNK_SIZE_CHARS = 1200
DEFAULT_CHUNK_OVERLAP_CHARS = 150


def chunk_document(
    text: str,
    target_size: int = DEFAULT_CHUNK_SIZE_CHARS,
    overlap: int = DEFAULT_CHUNK_OVERLAP_CHARS,
) -> list[ChunkItem]:
    """Split a policy document into section-aware overlapping chunks."""
    if not text.strip():
        return []

    # Identify all section headings and their offsets
    heading_matches = list(_HEADING_REGEX.finditer(text))

    sections: list[tuple[str | None, str]] = []
    if not heading_matches:
        # No markdown headings found; treat whole text as one section
        sections.append((None, text))
    else:
        # Preamble before the first heading
        first_heading_start = heading_matches[0].start()
        if first_heading_start > 0:
            preamble = text[:first_heading_start].strip()
            if preamble:
                sections.append(("Preamble", preamble))

        for idx, match in enumerate(heading_matches):
            heading_title = match.group(2).strip()
            start_pos = match.start()
            end_pos = (
                heading_matches[idx + 1].start()
                if idx + 1 < len(heading_matches)
                else len(text)
            )
            section_body = text[start_pos:end_pos].strip()
            if section_body:
                sections.append((heading_title, section_body))

    # Now chunk each section, respecting section boundaries
    chunks: list[ChunkItem] = []
    global_index = 0

    for sec_title, sec_content in sections:
        if len(sec_content) <= target_size:
            # Fits in one chunk
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
            # Sliding window over the section content
            # Try to split on paragraph or sentence boundaries
            paragraphs = sec_content.split("\n\n")
            current_chunk_parts: list[str] = []
            current_len = 0

            for para in paragraphs:
                para_clean = para.strip()
                if not para_clean:
                    continue

                if current_len + len(para_clean) > target_size and current_chunk_parts:
                    chunk_text = "\n\n".join(current_chunk_parts)
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

                    # Retain last paragraph for overlap if it fits
                    if len(current_chunk_parts[-1]) <= overlap:
                        current_chunk_parts = [current_chunk_parts[-1], para_clean]
                        current_len = len(current_chunk_parts[0]) + len(para_clean)
                    else:
                        current_chunk_parts = [para_clean]
                        current_len = len(para_clean)
                else:
                    current_chunk_parts.append(para_clean)
                    current_len += len(para_clean)

            if current_chunk_parts:
                chunk_text = "\n\n".join(current_chunk_parts)
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
