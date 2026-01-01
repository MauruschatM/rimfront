---
trigger: always_on
description: Monorepo and Turbo management standards
globs: "package.json,turbo.json,pnpm-workspace.yaml"
---

# Monorepo Rules

Best practices for managing the Rimfront monorepo.

## Structure

- **Apps**: Located in `apps/`.
- **Packages**: Located in `packages/`. Shared logic, types, and configuration.
- **Backends**: `packages/backend/convex` is the primary source of truth for game logic.

## Turbo & PNPM

- **Caching**: Use Turbo task caching for builds, tests, and linting.
- **Scripts**: Always run `pnpm dev` from the root to start all relevant services.
- **Catalogs**: Use `pnpm` catalogs in `pnpm-workspace.yaml` to sync versions across the monorepo.
- **Workspace References**: Use `workspace:*` or `catalog:` for internal dependencies.

## Shared Packages

- **@rimfront/config**: Shared ESLint, Biome, and TS configs.
- **@rimfront/env**: Centralized environment variable management and validation.
- **@rimfront/backend**: Shared types and function references derived from Convex.

<example>
  // Adding a package dependency
  // pnpm add @rimfront/backend --filter web
  
  // package.json entry
  "dependencies": {
    "@rimfront/backend": "workspace:*"
  }
</example>