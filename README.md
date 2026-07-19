# DataClean

A browser-based Excel/CSV data cleaning SaaS tool. Upload any spreadsheet, detect structure and data quality issues, apply AI-assisted cleaning suggestions, and export a clean file — without your data ever leaving memory.

## Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Python 3.11+ + FastAPI + Pandas + Pandera
- **AI layer**: Anthropic Claude (optional — falls back to rule-based parsing)

## Running locally

### Prerequisites
- Node.js 20+ and pnpm
- Python 3.11+

### Backend

```bash
pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend (local dev without Replit)

```bash
cd frontend   # or artifacts/data-cleaner in the monorepo
cp ../../.env.example .env
# Set VITE_API_BASE_URL=http://localhost:8000 in .env
pnpm install
pnpm dev
```

### Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | No | Enables AI NL command parsing |
| `SESSION_TTL_MINUTES` | No | Session expiry (default 60) |
| `MAX_FILE_SIZE_MB` | No | Upload limit (default 100) |
| `FUZZY_DEDUP_THRESHOLD` | No | Fuzzy match threshold (default 90) |
| `VITE_API_BASE_URL` | No | Backend URL for frontend (leave blank in Replit) |

## Deploying on Render / Vercel

### Backend (Render Web Service)

- **Build command**: `pip install -r backend/requirements.txt`
- **Start command**: `python -m uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
- **Environment**: `ANTHROPIC_API_KEY`, `CORS_ORIGINS=https://your-frontend.vercel.app`

### Frontend (Vercel)

- **Root directory**: `artifacts/data-cleaner` (or `frontend` in standalone layout)
- **Build command**: `pnpm build`
- **Output directory**: `dist/public`
- **Environment**: `VITE_API_BASE_URL=https://your-backend.onrender.com`

## Privacy

Uploaded files are processed in memory only. No file contents are written to disk or stored in a database. Sessions expire automatically after inactivity (default 60 minutes).

## Architecture

```
/
├── backend/                 # Python FastAPI service
│   ├── main.py              # App entry point + in-memory session store
│   ├── config.py            # Env-var configuration
│   ├── models/schemas.py    # Pydantic models (source of truth)
│   ├── routers/             # FastAPI route handlers
│   │   ├── upload.py        # POST /api/upload
│   │   ├── analyze.py       # Structure detection, type inference, suggestions
│   │   ├── apply.py         # Suggestion review, NL commands, preview
│   │   └── export.py        # Export, issues report, recipe
│   ├── engine/              # Core data cleaning algorithms
│   │   ├── structure_detection.py
│   │   ├── type_inference.py
│   │   ├── formatting.py
│   │   ├── deduplication.py
│   │   ├── missing_values.py
│   │   ├── validation.py
│   │   └── recipe.py
│   └── ai/
│       └── suggestion_engine.py  # Anthropic integration (swappable)
├── artifacts/data-cleaner/  # React + Vite frontend (Replit monorepo)
│   └── src/
│       ├── components/      # All UI components
│       ├── store/           # Zustand session state
│       ├── api/             # API client
│       └── types/           # TypeScript models
└── .env.example
```
