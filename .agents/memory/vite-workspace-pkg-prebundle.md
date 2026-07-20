---
name: Vite workspace package pre-bundle staleness
description: Enterprise API hooks stopped working because Vite pre-bundled @workspace/api-client-react from an older version of the file that lacked the new hooks.
---

## Rule

When new hooks/exports are added to a manually-edited generated file inside a workspace package, Vite's pre-bundle cache for that package may go stale and serve the old bundle — silently omitting the new exports at runtime.

## Fix

Add the package to `optimizeDeps.exclude` in `vite.config.ts`:

```ts
optimizeDeps: {
  exclude: ['@workspace/api-client-react'],
},
```

This forces Vite to process the package from TypeScript source on every request, never from a pre-bundled snapshot.

Also add `fs.allow: [workspaceRoot]` to ensure Vite's strict fs mode doesn't block access to workspace-level source files outside the artifact root:

```ts
fs: {
  strict: true,
  allow: [path.resolve(import.meta.dirname, '../..')],
},
```

**Why:** The `@workspace/api-client-react/src/generated/api.ts` file is edited manually (enterprise hooks appended at bottom). Vite's dep optimizer takes a snapshot of the package when it first runs; if the package grows after that snapshot, the new exports are invisible until the cache is busted.

**How to apply:** Any time new hooks are appended to `lib/api-client-react/src/generated/api.ts`, either clear `.vite/deps` cache or rely on `optimizeDeps.exclude` (already set) to force fresh processing.

## Also fixed

Duplicate `export *` statements in `lib/api-client-react/src/index.ts` (lines 5–6 duplicated lines 1–2) — removed the duplicates. While esbuild deduplicates them, they can confuse tree-shaking analysis.
