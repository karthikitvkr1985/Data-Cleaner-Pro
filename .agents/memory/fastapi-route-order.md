---
name: FastAPI route ordering — bulk before path param
description: Literal route segments must be declared before parameterized routes in the same router or FastAPI matches the literal string as the param value.
---

## Rule
In `backend/routers/apply.py`, the route `/sessions/{session_id}/suggestions/bulk` MUST be declared **before** `/sessions/{session_id}/suggestions/{suggestion_id}`.

**Why:** FastAPI registers and matches routes in declaration order. If `{suggestion_id}` comes first, the string "bulk" is captured as a suggestion_id, the lookup fails, and the endpoint returns 404 — not a "route not found" 404 but a "suggestion not found" one, which is very confusing to debug.

**How to apply:** Any time you add a new literal sub-path under a parameterized segment (e.g. `/items/export`, `/items/count`), always place it above the `/{item_id}` route in the file.
