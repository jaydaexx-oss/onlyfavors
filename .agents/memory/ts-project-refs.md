---
name: TypeScript project reference build order
description: lib/db must be compiled before api-server typecheck can resolve @workspace/db exports
---

## The rule
`artifacts/api-server/tsconfig.json` has `"references": [{ "path": "../../lib/db" }]`. TypeScript project references require the referenced package to have compiled `.d.ts` files in its `dist/` directory before the dependent package can run typecheck.

**Why:** `tsc --noEmit` resolves `@workspace/db` imports through the compiled declarations in `lib/db/dist/`, not through source files.

**How to apply:**
If you add exports to `lib/db/src/schema/` and then run `pnpm --filter @workspace/api-server run typecheck`, it will fail with "Module has no exported member X" even if the source is correct.

Fix: `cd lib/db && pnpm exec tsc -p tsconfig.json` first (compiles to `dist/`), then re-run the api-server typecheck.

The `pnpm -w run typecheck:libs` step in the codegen script already does this for the lib packages, but not for the api-server.
