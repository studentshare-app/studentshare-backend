# App Structure

## Goals

- Keep `app/` as a thin Expo Router layer.
- Group business logic by feature under `src/features`.
- Group platform-wide systems under `src/core`.
- Preserve compatibility during migration with shim exports from legacy paths.

## Current Migration Pattern

- Route files in `app/` should re-export feature screens.
- Shared app systems live under `src/core`.
- Feature screens live under `src/features/<feature>/screens`.
- Legacy imports in `contexts/`, `src/lib/`, and `src/services/` should point to `src/core`.

## Core Areas

- `src/core/api`
  Supabase client and API infrastructure.
- `src/core/auth`
  Auth providers and session-aware utilities.
- `src/core/entitlements`
  Premium/subscription state and entitlement checks.
- `src/core/config`
  Central route and config exports.
- `src/core/sync`
  Sync, realtime, and offline orchestration.

## Feature Areas

- `src/features/home`
- `src/features/search`
- `src/features/library`
- `src/features/profile`
- `src/features/forum`

Each feature should eventually own:

- `screens/`
- `components/`
- `hooks/`
- `api/`
- `db/`
- `types.ts`

## Migration Rules

1. New screens should be created in `src/features`, not `app/`.
2. New cross-cutting services should go in `src/core`.
3. Legacy files may remain as shim exports until all imports are updated.
4. Prefer `@/` imports inside `src/` to avoid brittle relative paths.
