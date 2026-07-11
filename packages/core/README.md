# kawaii-wiki.ts Core

Pure TypeScript domain package shared by the server and web app.

## What This Teaches

- functional core, imperative shell architecture
- typed `Result<T, E>` error handling instead of throwing through domain logic
- validation and normalization before persistence
- permission checks expressed as a small policy table
- Markdown rendering and slug generation without HTTP or database dependencies
- Markdown renderer extension seams for plugins, feature flags, and typed fence blocks

## Run

From the repository root:

```bash
bun test packages/core
bun --filter '@kawaii-wiki/core' typecheck
```

## Files To Read First

| File | Why it matters |
| --- | --- |
| `src/result.ts` | success/error values used across the app |
| `src/errors.ts` | typed application errors |
| `src/page.ts` | page input validation |
| `src/permissions.ts` | central authorization policy |
| `src/markdown.ts` | Markdown to HTML pipeline, feature flags, typed fences, `createRenderer()`, `registerFenceRenderer()` |
| `src/slug.ts` | Unicode-safe slug behavior |

## Exercises

1. Add a new permission action and cover it with a test.
2. Add validation for a new page field without importing server code.
3. Extend Markdown rendering with `createRenderer({ features, plugins, fences })` and keep it deterministic.
4. Add a failing test first, then update the pure function.
