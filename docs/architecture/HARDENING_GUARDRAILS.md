# Hardening Guardrails

## Route Verification

Run:

```bash
npm run verify:app-routes
```

This checks that:

- every TypeScript file under `app/` is still a thin wrapper or an allowed redirect route
- each wrapper target under `@/core` or `@/features` resolves to a real file
- redirect routes still point at real app routes

This is the quickest way to catch migration drift when someone accidentally puts business logic back into `app/` or renames a feature screen without updating its wrapper.

## Root File Audit

Run:

```bash
npm run audit:root-files
```

This is read-only. It inventories suspicious zero-byte files at the workspace root and groups them by likely origin.

Current signal:

- the root contains many zero-byte files with code-fragment names
- these are almost certainly accidental artifacts, not intended source files
- they should be cleaned in a separate, explicit pass after reviewing the generated inventory

## Safe Cleanup Sequence

1. Run `npm run audit:root-files`.
2. Review the generated list and confirm every file is a root-level zero-byte artifact.
3. Delete only the audited zero-byte files, not similarly named files inside real source folders.
4. Re-run `npm run verify:app-routes` and `npx tsc --noEmit`.

This keeps the cleanup deliberate and low-risk.
