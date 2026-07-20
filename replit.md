# DataClean

A browser-based Excel/CSV data cleaning SaaS tool. Upload any spreadsheet, detect structure and data quality issues, apply AI-assisted cleaning suggestions, and export a clean file — without your data ever leaving memory.

## Run & Operate

- **Frontend** (`artifacts/data-cleaner`): `pnpm --filter @workspace/data-cleaner run dev` — React + Vite on port 24805, preview at `/`
- **Backend** (`artifacts/api-server`): `.venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8080 --reload --app-dir /home/runner/workspace` — FastAPI on port 8080, proxied at `/api`
- `pnpm install` — install JS dependencies
- `uv pip install --python .venv/bin/python3 -r backend/requirements.txt` — install Python dependencies

Both workflows are managed artifacts and start automatically:
- `artifacts/data-cleaner: web`
- `artifacts/api-server: API Server`

## Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS (pnpm workspace)
- **Backend**: Python 3.12 + FastAPI + Pandas + Pandera (uv venv at `.venv/`)
- **AI layer**: Anthropic Claude — optional, falls back to rule-based parsing without `ANTHROPIC_API_KEY`

## Where things live

- `backend/` — Python FastAPI service (entry: `backend/main.py`)
- `backend/engine/` — core data cleaning algorithms (structure detection, type inference, dedup, etc.)
- `backend/routers/` — API route handlers (`upload`, `analyze`, `apply`, `export`)
- `backend/ai/suggestion_engine.py` — Anthropic integration (swappable)
- `artifacts/data-cleaner/src/` — React frontend
- `artifacts/data-cleaner/src/components/` — UI components
- `artifacts/data-cleaner/src/store/` — Zustand session state
- `artifacts/data-cleaner/src/api/` — API client

## Architecture decisions

- Sessions are fully in-memory (no database). Uploaded file contents are never written to disk.
- Sessions expire automatically after inactivity (default 60 min, configurable via `SESSION_TTL_MINUTES`).
- The Vite dev server proxies `/api/*` to the FastAPI backend (port 8080 in Replit).
- AI NL command parsing is optional — the app works without `ANTHROPIC_API_KEY`.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | No | Enables AI natural-language command parsing |
| `SESSION_TTL_MINUTES` | No | Session expiry in minutes (default 60) |
| `MAX_FILE_SIZE_MB` | No | Upload size limit (default 100) |
| `FUZZY_DEDUP_THRESHOLD` | No | Fuzzy dedup match threshold (default 90) |

## Gotchas

- Python packages live in `.venv/` (uv-managed). Use absolute path `.venv/bin/uvicorn` to run the backend.
- FastAPI `/bulk` routes must be declared before `/{param}` routes or FastAPI matches "bulk" as the param value.
- Character class `['\""]` breaks the Python string parser in suggestion_engine.py — use `['"]` (no backslash) inside double-quoted raw strings.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._
