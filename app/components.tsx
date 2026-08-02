import type { PropsWithChildren, ButtonHTMLAttributes } from 'react'
import clsx from 'clsx'
import * as Slot from '@radix-ui/react-slot'
import { ChevronRightIcon } from '~/shared/icons'

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
				'bg-paper',
				className,
			)}
		>
			{children}
		</div>
	)
}

interface BaseProps extends PropsWithChildren {
	className?: string
}

export function Block({ className, children }: BaseProps) {
	return <div className={clsx('p-4', className)}>{children}</div>
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'text'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	className?: string
	variant?: ButtonVariant
}

const buttonBase =
	'rounded-panel px-4 py-2 text-sm font-semibold transition-[background-color,color,transform,box-shadow] duration-150 ease-out active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-600'

const buttonVariants: Record<ButtonVariant, string> = {
	primary: 'bg-ink-900 text-white hover:bg-ink-800 shadow-sm hover:shadow',
	secondary:
		'bg-paper-raised text-ink-900 border border-ink-400 hover:border-ink-600 hover:bg-ink-50',
	danger: 'bg-danger-soft text-danger hover:bg-danger/10',
	text: 'bg-transparent text-ember-600 underline underline-offset-2 hover:text-ember-700 hover:bg-transparent',
}

export function Button({
	className,
	variant = 'primary',
	children,
	...props
}: ButtonProps) {
	return (
		<button
			className={clsx(buttonBase, buttonVariants[variant], className)}
			{...props}
		>
			{children}
		</button>
	)
}

export { Button as NavbarBackLink }

export function List({ className, children }: BaseProps) {
	return <ul className={clsx('divide-y divide-edge', className)}>{children}</ul>
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
	const isClickable = asChild || link

	return (
		<Comp
			className={clsx(
				'block py-3 px-4',
				isClickable && 'cursor-pointer hover:bg-ink-50',
				className,
			)}
			onClick={onClick}
		>
			<div className="flex items-center justify-between gap-3">
				<div className="flex min-w-0 flex-1 items-center justify-between gap-3">
					{title && <div className="font-medium text-ink-900">{title}</div>}
					{after && <div>{after}</div>}
				</div>
				{isClickable && !after && <ChevronRightIcon className="text-ink-400" />}
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
				'sticky top-0 z-10 bg-paper px-4 py-3 flex items-center gap-4 border-b border-edge',
				className,
			)}
		>
			{left}
			{title && (
				<h1 className="text-base font-semibold text-ink-900">{title}</h1>
			)}
			{children}
		</nav>
	)
}

export function Page({ className, children }: BaseProps) {
	return (
		<main className={clsx('absolute inset-0 overflow-y-auto', className)}>
			{children}
		</main>
	)
}
