"use client";
import { Separator as SeparatorPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
function Separator({ className, orientation = "horizontal", decorative = true, ...props }) {
    return (<SeparatorPrimitive.Root className={cn("shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch", className)} data-slot="separator" decorative={decorative} orientation={orientation} {...props}/>);
}
export { Separator };
