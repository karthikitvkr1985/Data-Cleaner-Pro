---
name: Python venv setup
description: How Python packages are installed and run in this Replit NixOS environment
---

Replit NixOS does not allow system-level pip installs. Use `uv` to create and manage a virtualenv.

**Setup:**
```bash
cd /home/runner/workspace
uv venv .venv
uv pip install -r backend/requirements.txt
```

**Workflow command (artifact.toml):**
Must use the absolute path — relative `.venv/bin/...` fails because the workflow may run from a different working directory:
```
/home/runner/workspace/.venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8080 --reload --app-dir /home/runner/workspace
```

**Why:** The NixOS store is immutable; `pip install --system` and `uv pip install --system` both fail. The `.venv` at the workspace root is the canonical Python environment for this project.

**How to apply:** Any time you add a new Python dependency, `uv pip install <pkg>` (with the venv active or using `uv pip install --python .venv/bin/python <pkg>`).
