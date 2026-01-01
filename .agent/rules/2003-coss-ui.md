---
trigger: always_on
description: Use Coss UI components when designing to ensure consistent styling
globs: apps/web/**/*.tsx
---

# Coss UI Rules

<author>blefnk/rules</author>
<version>1.0.0</version>

## Context

- For integrating Shadcn UI primitives
- Maintains consistency and design standards

## Requirements

- Import Shadcn primitives from `@/components/ui/coss`.
- Keep app-specific components in `@/components/ui/coss`.
- Match Shadcn design and naming conventions.
- Style <Link> using `cn()` and `buttonVariants` when you need a button-like style.
- Use <Button> only when you need to call a function.

## Examples

<example>
  import { Button } from "~/components/ui/coss/button";
  
  export function ConfirmButton() {
    return <Button>Confirm</Button>;
  }
</example>

<example type="invalid">
  import { Button } from "shadcn-ui";
  
  export function ConfirmButton() {
    return <Button>Confirm</Button>;
  }
</example>

<example>

  ```tsx
  import { Link } from "next/link";
  import { cn } from "~/lib/utils";
  import { buttonVariants } from "~/components/ui/coss/button";
  
  export function HomeLink() {
    return (
      <Link
        href="/"
        className={cn(
          buttonVariants({
            variant: "default",
            className: "mx-auto mt-4 w-fit",
          }),
        )}
      >
        Home
      </Link>
    );
  }
  ```

</example>

<example type="invalid">
  
  ```tsx
  import { Link } from "next/link";
  import { Button } from "~/components/ui/coss/button";
  
  export function HomeLink() {
    return (
      <Button
        className="mx-auto mt-4 w-fit"
      >
        <Link href="/">Home</Link>
      </Button>
    );
  }
  ```

</example>