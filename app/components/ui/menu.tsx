import * as React from 'react'
import { Menu as MenuPrimitive } from '@base-ui/react/menu'

import { cn } from '~/shared/utils'

function MenuRoot(props: React.ComponentProps<typeof MenuPrimitive.Root>) {
	return <MenuPrimitive.Root data-slot="menu" {...props} />
}

function MenuTrigger(props: React.ComponentProps<typeof MenuPrimitive.Trigger>) {
	return <MenuPrimitive.Trigger data-slot="menu-trigger" {...props} />
}

function MenuPositioner(
	props: React.ComponentProps<typeof MenuPrimitive.Positioner>,
) {
	return <MenuPrimitive.Positioner data-slot="menu-positioner" {...props} />
}

function MenuPortal(props: React.ComponentProps<typeof MenuPrimitive.Portal>) {
	return <MenuPrimitive.Portal data-slot="menu-portal" {...props} />
}

function MenuPopup({
	className,
	...props
}: React.ComponentProps<typeof MenuPrimitive.Popup>) {
	return (
		<MenuPrimitive.Popup
			data-slot="menu-popup"
			className={cn(
				'z-50 min-w-44 overflow-hidden rounded-panel border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none',
				className,
			)}
			{...props}
		/>
	)
}

function MenuItem({
	className,
	...props
}: React.ComponentProps<typeof MenuPrimitive.Item>) {
	return (
		<MenuPrimitive.Item
			data-slot="menu-item"
			className={cn(
				'relative flex w-full cursor-default select-none items-center gap-2 rounded-[min(var(--radius-md),10px)] px-2.5 py-1.5 text-sm outline-none transition-colors',
				'focus:bg-accent focus:text-accent-foreground',
				'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
				'[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
				className,
			)}
			{...props}
		/>
	)
}

function MenuGroup(props: React.ComponentProps<typeof MenuPrimitive.Group>) {
	return <MenuPrimitive.Group data-slot="menu-group" {...props} />
}

function MenuGroupLabel({
	className,
	...props
}: React.ComponentProps<typeof MenuPrimitive.GroupLabel>) {
	return (
		<MenuPrimitive.GroupLabel
			data-slot="menu-group-label"
			className={cn(
				'px-2.5 py-1.5 text-xs text-muted-foreground',
				className,
			)}
			{...props}
		/>
	)
}

function MenuSeparator({
	className,
	...props
}: React.ComponentProps<typeof MenuPrimitive.Separator>) {
	return (
		<MenuPrimitive.Separator
			data-slot="menu-separator"
			className={cn('-mx-1 my-1 h-px bg-border', className)}
			{...props}
		/>
	)
}

export {
	MenuRoot,
	MenuTrigger,
	MenuPortal,
	MenuPositioner,
	MenuPopup,
	MenuItem,
	MenuGroup,
	MenuGroupLabel,
	MenuSeparator,
}
