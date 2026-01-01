---
trigger: always_on
description: Better Auth integration with Convex and Next.js
globs: "packages/backend/convex/auth.ts,apps/web/src/lib/auth.ts"
---

# Better Auth Rules

Standardized authentication patterns using Better Auth and Convex.

## Backend (Convex)

- **Configuration**: Always define auth in `packages/backend/convex/auth.ts`.
- **Client Creation**: Use `createClient<DataModel>(components.betterAuth)` to integrate with the Convex service.
- **Current User**: Use `getCurrentUser` query from the auth component for server-side user resolution.
- **Trusted Origins**: Ensure `trustedOrigins` includes the current development/production URLs (e.g., `exp://...` for native if applicable).

## Frontend (Next.js)

- **Auth Helper**: Use the auth helper from `@packages/backend/convex/auth` for client-side state.
- **Login/Signup**: Use the `emailAndPassword` plugin for standard auth.
- **Zod Schema**: Validate auth inputs (email/password) using Zod.

## Security

- **Environment**: Use `SITE_URL` and `BETTER_AUTH_SECRET` correctly in environment variables.
- **Protection**: Use middleware or server action checks for protected routes.

<example>
  // Auth Query in Convex
  import { query } from "./_generated/server";
  import { authComponent } from "./auth";

  export const me = query({
    args: {},
    handler: async (ctx) => {
      const user = await authComponent.safeGetAuthUser(ctx);
      if (!user) return null;
      return user;
    },
  });
</example>