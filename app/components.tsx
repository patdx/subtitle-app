import type { PropsWithChildren, ButtonHTMLAttributes } from 'react'
import clsx from 'clsx'
import * as Slot from '@radix-ui/react-slot'

export function App({
	className,
	children,
}: PropsWithChildren<{
	className?: string
}>) {
	return (
		<div
			className={clsx(
				'relative w-full',
				'min-h-svh max-h-svh h-svh',
				'pwa:min-h-lvh pwa:max-h-lvh pwa:h-lvh',
				className,
			)}
		>
			{children}
		</div>
	)
}

// <div
// 	className={cn(
// 		className,
// 'min-h-svh max-h-svh h-svh',
// 'pwa:min-h-lvh pwa:max-h-lvh pwa:h-lvh',
// 	)}
// 	{...rest}
// />

interface BaseProps extends PropsWithChildren {
	className?: string
}

export function Block({ className, children }: BaseProps) {
	return <div className={clsx('p-4', className)}>{children}</div>
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	className?: string
}

export function Button({ className, children, ...props }: ButtonProps) {
	return (
		<button
			className={clsx(
				'rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600 disabled:opacity-60',
				className,
			)}
			{...props}
		>
			{children}
		</button>
	)
}

export { Button as NavbarBackLink }

export function List({ className, children }: BaseProps) {
	return (
		<ul className={clsx('divide-y divide-gray-200', className)}>{children}</ul>
	)
}

export interface ListItemProps extends BaseProps {
	title?: string
	after?: React.ReactNode
	footer?: React.ReactNode
	link?: boolean
	onClick?: (e: React.MouseEvent<HTMLLIElement>) => void
	asChild?: boolean
}

export function ListItem({
	className,
	children,
	title,
	after,
	footer,
	link,
	onClick,
	asChild,
}: ListItemProps) {
	const Comp = asChild ? Slot.Root : 'li'

	return (
		<Comp
			className={clsx(
				'block py-3 px-4',
				link && 'cursor-pointer hover:bg-gray-50',
				className,
			)}
			onClick={onClick}
		>
			<div className="flex items-center justify-between">
				{title && <div className="font-medium">{title}</div>}
				{after && <div>{after}</div>}
			</div>
			<Slot.Slottable>{children}</Slot.Slottable>
			{footer && <div className="mt-2">{footer}</div>}
		</Comp>
	)
}

export function Navbar({
	className,
	children,
	title,
	left,
}: BaseProps & {
	title?: string
	left?: React.ReactNode
}) {
	return (
		<nav
			className={clsx(
				'bg-white shadow px-4 py-3 flex items-center gap-4',
				className,
			)}
		>
			{left}
			{title && <h1 className="text-lg font-medium">{title}</h1>}
			{children}
		</nav>
	)
}

export function Page({ className, children }: BaseProps) {
	return <main className={clsx('absolute inset-0', className)}>{children}</main>
}
