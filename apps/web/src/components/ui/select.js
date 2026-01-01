"use client";
import { IconCheck, IconChevronDown, IconChevronUp, IconSelector, } from "@tabler/icons-react";
import { Select as SelectPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
function Select({ ...props }) {
    return <SelectPrimitive.Root data-slot="select" {...props}/>;
}
function SelectGroup({ className, ...props }) {
    return (<SelectPrimitive.Group className={cn("scroll-my-1", className)} data-slot="select-group" {...props}/>);
}
function SelectValue({ ...props }) {
    return <SelectPrimitive.Value data-slot="select-value" {...props}/>;
}
function SelectTrigger({ className, size = "default", children, ...props }) {
    return (<SelectPrimitive.Trigger className={cn("flex w-fit select-none items-center justify-between gap-1.5 whitespace-nowrap rounded-none border border-input bg-transparent py-2 pr-2 pl-2.5 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-none data-[placeholder]:text-muted-foreground *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:hover:bg-input/50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0", className)} data-size={size} data-slot="select-trigger" {...props}>
      {children}
      <SelectPrimitive.Icon asChild>
        <IconSelector className="pointer-events-none size-4 text-muted-foreground"/>
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>);
}
function SelectContent({ className, children, position = "item-aligned", align = "center", ...props }) {
    return (<SelectPrimitive.Portal>
      <SelectPrimitive.Content align={align} className={cn("data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 max-h-(--radix-select-content-available-height) min-w-36 origin-(--radix-select-content-transform-origin) overflow-y-auto overflow-x-hidden rounded-none bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-closed:animate-out data-open:animate-in", position === "popper" &&
            "data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1", className)} data-slot="select-content" position={position} {...props}>
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport className={cn("data-[position=popper]:h-[var(--radix-select-trigger-height)] data-[position=popper]:w-full data-[position=popper]:min-w-[var(--radix-select-trigger-width)]", position === "popper" && "")} data-position={position}>
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>);
}
function SelectLabel({ className, ...props }) {
    return (<SelectPrimitive.Label className={cn("px-2 py-2 text-muted-foreground text-xs", className)} data-slot="select-label" {...props}/>);
}
function SelectItem({ className, children, ...props }) {
    return (<SelectPrimitive.Item className={cn("relative flex w-full cursor-default select-none items-center gap-2 rounded-none py-2 pr-8 pl-2 text-xs outline-hidden focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2", className)} data-slot="select-item" {...props}>
      <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <IconCheck className="pointer-events-none"/>
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>);
}
function SelectSeparator({ className, ...props }) {
    return (<SelectPrimitive.Separator className={cn("pointer-events-none -mx-1 h-px bg-border", className)} data-slot="select-separator" {...props}/>);
}
function SelectScrollUpButton({ className, ...props }) {
    return (<SelectPrimitive.ScrollUpButton className={cn("z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4", className)} data-slot="select-scroll-up-button" {...props}>
      <IconChevronUp />
    </SelectPrimitive.ScrollUpButton>);
}
function SelectScrollDownButton({ className, ...props }) {
    return (<SelectPrimitive.ScrollDownButton className={cn("z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4", className)} data-slot="select-scroll-down-button" {...props}>
      <IconChevronDown />
    </SelectPrimitive.ScrollDownButton>);
}
export { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectScrollDownButton, SelectScrollUpButton, SelectSeparator, SelectTrigger, SelectValue, };
