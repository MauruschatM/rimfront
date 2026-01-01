---
trigger: always_on
description: Use Coss UI components when designing to ensure consistent styling
globs: apps/web/**/*.tsx
---

# Shadcn UI Rules

Standards for using and extending Shadcn UI components.

## Core Requirements

- **Primitive Location**: Store Shadcn primitives in `apps/web/src/components/ui`.
- **Customization**: When modifying a Shadcn component, keep the structure but adapt styles to the project theme.
- **Iconography**: Use `@tabler/icons-react` or `lucide-react` consistently.
- **Button Variants**: Use `buttonVariants` for styling `<Link>` as buttons. Use the `<Button>` component for functional clicks.

## Component Patterns

- **Dialogs/Modals**: Use `Dialog` or `Sheet` with descriptive titles.
- **Forms**: Integrate with `react-hook-form` and `@tanstack/react-form` using the `form.tsx` wrapper.
- **Loading**: Use `Skeleton` for all async UI states.

## Accessibility

- Always include `aria-label` or `sr-only` text if a button only has an icon.
- Ensure proper focus rings (`ring-offset-background focus-visible:ring-2`).

<example>
  import { Button } from "@/components/ui/button";
  import { IconSettings } from "@tabler/icons-react";

  export function SettingsButton() {
    return (
      <Button variant="outline" size="icon">
        <IconSettings className="h-4 w-4" />
        <span className="sr-only">Open Settings</span>
      </Button>
    );
  }
</example>
