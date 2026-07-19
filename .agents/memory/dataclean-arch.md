---
name: DataClean architecture
description: Key architecture decisions for the DataClean Excel/CSV cleaning SaaS
---

**Backend:** Python 3.13 FastAPI in `backend/` at workspace root. Runs via uvicorn with venv (see python-venv.md). Session store is an in-memory dict with threading.Lock + TTL expiry — no database, no file persistence. Files live only in memory per session.

**Frontend:** React 18 + Vite + TypeScript in `artifacts/data-cleaner/`. Workspace root monorepo artifact at preview path `/`.

**API routing:** The `artifacts/api-server` artifact owns `/api` path on port 8080. The proxy routes `/api/*` to the Python backend.

**No Replit-specific dependencies:** No Replit DB/Auth/Storage/SDK. Must remain portable to Render/Vercel after git push.

**AI layer:** `backend/ai/suggestion_engine.py` reads ANTHROPIC_API_KEY from env. If unset, falls back to rule-based NL parsing gracefully.

**File upload/download:** Must use custom fetch (FormData/Blob) — NOT the generated React Query hooks. Generated hooks don't handle multipart or binary properly.

**Codegen:** OpenAPI spec at `lib/api-spec/openapi.yaml`. Run `pnpm --filter @workspace/api-spec run codegen` to regenerate hooks. See api-zod-codegen.md for the index.ts fix that must be part of the script.
