#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

# Run backend tests
pip install -q pytest 2>/dev/null || true
python3 -m pytest backend/tests -v --tb=short 2>&1
echo "Backend tests completed."
