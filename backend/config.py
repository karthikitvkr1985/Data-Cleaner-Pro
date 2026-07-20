from __future__ import annotations

import os

# Anthropic API configuration
ANTHROPIC_API_KEY: str | None = os.environ.get("ANTHROPIC_API_KEY")

# Session configuration
SESSION_TTL_MINUTES: int = int(os.environ.get("SESSION_TTL_MINUTES", "60"))
MAX_FILE_SIZE_MB: int = int(os.environ.get("MAX_FILE_SIZE_MB", "100"))
MAX_FILE_SIZE_BYTES: int = MAX_FILE_SIZE_MB * 1024 * 1024

# Deduplication configuration
FUZZY_DEDUP_THRESHOLD: int = int(os.environ.get("FUZZY_DEDUP_THRESHOLD", "90"))

# CORS origins (comma-separated)
CORS_ORIGINS: list[str] = os.environ.get("CORS_ORIGINS", "*").split(",")

# Allow all origins in dev if wildcard
CORS_ALLOW_ALL: bool = "*" in CORS_ORIGINS
