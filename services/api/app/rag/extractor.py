"""Policy document text extraction and sanitization with security guards."""

from __future__ import annotations

import asyncio
import hashlib
import io
import re
from concurrent.futures import ThreadPoolExecutor

from pypdf import PdfReader

MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
MAX_PDF_PAGES = 50
MAX_EXTRACTED_CHARS = 100_000
EXTRACTION_TIMEOUT_SECONDS = 15.0

_EXTRACTOR_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="extractor_worker")

# Regex to strip zero-width characters and control chars (preserve standard whitespace: \t, \n, \r)
_ZERO_WIDTH_CHARS = re.compile(r"[\u200b\u200c\u200d\u200e\u200f\ufeff\u202a-\u202e]")
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]")


class ExtractionError(Exception):
    """Raised when document extraction fails validation or security constraints."""


def sanitize_text(text: str) -> str:
    """
    Sanitize extracted document text by stripping control chars,
    zero-width chars, and normalizing whitespace.
    """
    if not text:
        return ""
    # Remove zero-width characters
    cleaned = _ZERO_WIDTH_CHARS.sub("", text)
    # Remove disallowed control characters
    cleaned = _CONTROL_CHARS.sub("", cleaned)
    # Normalize carriage returns
    cleaned = cleaned.replace("\r\n", "\n").replace("\r", "\n")
    # Collapse multiple consecutive blank lines
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def compute_sha256(content: bytes) -> str:
    """Compute hex SHA-256 checksum of raw file bytes."""
    return hashlib.sha256(content).hexdigest()


def _extract_pdf_sync(content: bytes) -> str:
    """Synchronous PDF extraction using pypdf with page and character limit enforcement."""
    try:
        reader = PdfReader(io.BytesIO(content))
    except Exception as exc:
        raise ExtractionError(f"Failed to parse PDF document: {exc}") from exc

    if reader.is_encrypted:
        raise ExtractionError("Encrypted or password-protected PDFs are forbidden")

    page_count = len(reader.pages)
    if page_count > MAX_PDF_PAGES:
        raise ExtractionError(
            f"PDF exceeds maximum page limit of {MAX_PDF_PAGES} pages (found {page_count})"
        )

    extracted_pages: list[str] = []
    total_chars = 0

    for idx, page in enumerate(reader.pages):
        try:
            page_text = page.extract_text() or ""
        except Exception as exc:
            raise ExtractionError(f"Error extracting text from page {idx + 1}: {exc}") from exc

        total_chars += len(page_text)
        if total_chars > MAX_EXTRACTED_CHARS:
            raise ExtractionError(
                f"PDF extracted text exceeds maximum limit of {MAX_EXTRACTED_CHARS} characters"
            )
        extracted_pages.append(page_text)

    full_text = "\n\n".join(extracted_pages)
    sanitized = sanitize_text(full_text)

    if len(sanitized) < 20:
        raise ExtractionError(
            "Document contains insufficient readable text "
            "(possible scanned/image-only PDF or empty file)"
        )

    return sanitized


async def extract_pdf(content: bytes) -> str:
    """Extract and sanitize text from raw PDF bytes within a bounded thread pool and timeout."""
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise ExtractionError(
            f"File size exceeds maximum limit of {MAX_FILE_SIZE_BYTES} bytes "
            f"({len(content)} bytes uploaded)"
        )

    loop = asyncio.get_running_loop()
    try:
        return await asyncio.wait_for(
            loop.run_in_executor(_EXTRACTOR_EXECUTOR, _extract_pdf_sync, content),
            timeout=EXTRACTION_TIMEOUT_SECONDS,
        )
    except TimeoutError as exc:
        raise ExtractionError(
            f"PDF extraction timed out after {EXTRACTION_TIMEOUT_SECONDS}s"
        ) from exc


def extract_markdown(content: bytes | str) -> str:
    """Extract and sanitize markdown / plain-text policy documents."""
    if isinstance(content, bytes):
        if len(content) > MAX_FILE_SIZE_BYTES:
            raise ExtractionError(
                f"File size exceeds maximum limit of {MAX_FILE_SIZE_BYTES} bytes "
                f"({len(content)} bytes uploaded)"
            )
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ExtractionError(f"Markdown file must be valid UTF-8: {exc}") from exc
    else:
        text = content

    if len(text) > MAX_EXTRACTED_CHARS:
        raise ExtractionError(
            f"Document text exceeds maximum limit of {MAX_EXTRACTED_CHARS} characters"
        )

    sanitized = sanitize_text(text)
    if len(sanitized) < 20:
        raise ExtractionError(
            "Document contains insufficient text (must be at least 20 characters)"
        )

    return sanitized
