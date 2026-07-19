---
name: api-zod index.ts codegen collision
description: Orval overwrites lib/api-zod/src/index.ts every codegen run; how to prevent broken barrel exports
---

**Problem:** Orval (with `mode: "split"`) regenerates `lib/api-zod/src/index.ts` on every codegen run. If the `schemas` option is present, the barrel includes `export * from './generated/types'` alongside `export * from './generated/api'`, causing TS2308 duplicate export errors for query-param types like `ExportSessionParams`, `GetPreviewParams`, `GetSuggestionsParams`.

**Fix applied:**
1. Removed `schemas: { path: "generated/types", type: "typescript" }` from the `zod` output in `lib/api-spec/orval.config.ts`.
2. The codegen script in `lib/api-spec/package.json` now overwrites `lib/api-zod/src/index.ts` after orval runs, keeping only `export * from "./generated/api"`.

**Why:** Without step 2, Orval writes a stale barrel with the types import even after removing the schemas option (due to prior cache or Orval's barrel generation logic). Manual overwrite after orval is the reliable fix.

**How to apply:** When running codegen, the package.json script handles this automatically. Never add `schemas` back to the zod output config.
