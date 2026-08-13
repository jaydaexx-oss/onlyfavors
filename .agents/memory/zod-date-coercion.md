---
name: Zod format:date coercion
description: Orval-generated Zod schemas coerce format:date OpenAPI fields to Date objects, not strings
---

## The rule
When an OpenAPI field uses `format: date` or `format: date-time`, Orval generates `zod.coerce.date()` for the Zod schema. After `.parse()`, the value is a JavaScript `Date` object, not a string.

**Why this matters:** Drizzle `text()` columns expect `string | SQL | Placeholder`. Passing a `Date` causes a TypeScript overload mismatch and a runtime type error.

**How to apply:**
Before any Drizzle insert/update with date fields, serialize back to ISO string:
```typescript
const dateStr =
  body.date instanceof Date
    ? body.date.toISOString().split("T")[0]
    : String(body.date);
```

For datetime fields use `.toISOString()` without the split.

This pattern is already applied in `artifacts/api-server/src/routes/marketplace.ts` for both `date` and `preferredDate` fields.
