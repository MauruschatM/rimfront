"use client";
import { IconCheck, IconChevronRight } from "@tabler/icons-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
function DropdownMenu({ ...props }) {
    return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props}/>;
}
function DropdownMenuPortal({ ...props }) {
    return (<DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props}/>);
}
function DropdownMenuTrigger({ ...props }) {
    return (<DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props}/>);
}
function DropdownMenuContent({ className, align = "start", sideOffset = 4, ...props }) {
    return (<DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content align={align} className={cn("data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 max-h-(--radix-dropdown-menu-content-available-height) w-(--radix-dropdown-menu-trigger-width) min-w-32 origin-(--radix-dropdown-menu-content-transform-origin) overflow-y-auto overflow-x-hidden rounded-none bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-closed:animate-out data-open:animate-in data-[state=closed]:overflow-hidden", className)} data-slot="dropdown-menu-content" sideOffset={sideOffset} {...props}/>
    </DropdownMenuPrimitive.Portal>);
}
function DropdownMenuGroup({ ...props }) {
    return (<DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props}/>);
}
function DropdownMenuItem({ className, inset, variant = "default", ...props }) {
    return (<DropdownMenuPrimitive.Item className={cn("group/dropdown-menu-item relative flex cursor-default select-none items-center gap-2 rounded-none px-2 py-2 text-xs outline-hidden focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-[disabled]:pointer-events-none data-[inset]:pl-8 data-[variant=destructive]:text-destructive data-[disabled]:opacity-50 data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 data-[variant=destructive]:*:[svg]:text-destructive", className)} data-inset={inset} data-slot="dropdown-menu-item" data-variant={variant} {...props}/>);
}
function DropdownMenuCheckboxItem({ className, children, checked, ...props }) {
    return (<DropdownMenuPrimitive.CheckboxItem checked={checked} className={cn("relative flex cursor-default select-none items-center gap-2 rounded-none py-2 pr-8 pl-2 text-xs outline-hidden focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0", className)} data-slot="dropdown-menu-checkbox-item" {...props}>
      <span className="pointer-events-none pointer-events-none absolute right-2 flex items-center justify-center" data-slot="dropdown-menu-checkbox-item-indicator">
        <DropdownMenuPrimitive.ItemIndicator>
          <IconCheck />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>);
}
function DropdownMenuRadioGroup({ ...props }) {
    return (<DropdownMenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props}/>);
}
function DropdownMenuRadioItem({ className, children, ...props }) {
    return (<DropdownMenuPrimitive.RadioItem className={cn("relative flex cursor-default select-none items-center gap-2 rounded-none py-2 pr-8 pl-2 text-xs outline-hidden focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0", className)} data-slot="dropdown-menu-radio-item" {...props}>
      <span className="pointer-events-none pointer-events-none absolute right-2 flex items-center justify-center" data-slot="dropdown-menu-radio-item-indicator">
        <DropdownMenuPrimitive.ItemIndicator>
          <IconCheck />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>);
}
function DropdownMenuLabel({ className, inset, ...props }) {
    return (<DropdownMenuPrimitive.Label className={cn("px-2 py-2 text-muted-foreground text-xs data-[inset]:pl-8", className)} data-inset={inset} data-slot="dropdown-menu-label" {...props}/>);
}
function DropdownMenuSeparator({ className, ...props }) {
    return (<DropdownMenuPrimitive.Separator className={cn("-mx-1 h-px bg-border", className)} data-slot="dropdown-menu-separator" {...props}/>);
}
function DropdownMenuShortcut({ className, ...props }) {
    return (<span className={cn("ml-auto text-muted-foreground text-xs tracking-widest group-focus/dropdown-menu-item:text-accent-foreground", className)} data-slot="dropdown-menu-shortcut" {...props}/>);
}
function DropdownMenuSub({ ...props }) {
    return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props}/>;
}
function DropdownMenuSubTrigger({ className, inset, children, ...props }) {
    return (<DropdownMenuPrimitive.SubTrigger className={cn("flex cursor-default select-none items-center gap-2 rounded-none px-2 py-2 text-xs outline-hidden focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-open:bg-accent data-[inset]:pl-8 data-open:text-accent-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0", className)} data-inset={inset} data-slot="dropdown-menu-sub-trigger" {...props}>
      {children}
      <IconChevronRight className="ml-auto"/>
    </DropdownMenuPrimitive.SubTrigger>);
}
function DropdownMenuSubContent({ className, ...props }) {
    return (<DropdownMenuPrimitive.SubContent className={cn("data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[96px] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-none bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 data-closed:animate-out data-open:animate-in", className)} data-slot="dropdown-menu-sub-content" {...props}/>);
}
export { DropdownMenu, DropdownMenuPortal, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, };
