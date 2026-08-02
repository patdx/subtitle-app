import {
	isValidElement,
	type PropsWithChildren,
} from 'react'
import clsx from 'clsx'
import { useRender } from '@base-ui/react/use-render'
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

export function ListItem(props: ListItemProps) {
	const { className, children, title, after, footer, link, onClick, asChild } =
		props
	const isClickable = asChild || link

	const childElement =
		asChild && isValidElement<{ children?: React.ReactNode }>(children)
			? children
			: undefined

	const renderElement = useRender({
		render: childElement,
		defaultTagName: 'li',
		props: {
			className: clsx(
				'block py-3 px-4',
				isClickable && 'cursor-pointer hover:bg-ink-50',
				className,
			),
			onClick,
			children: (
				<>
					<div className="flex items-center justify-between gap-3">
						<div className="flex min-w-0 flex-1 items-center justify-between gap-3">
							{title && <div className="font-medium text-ink-900">{title}</div>}
							{after && <div>{after}</div>}
						</div>
						{isClickable && !after && (
							<ChevronRightIcon className="text-ink-400" />
						)}
					</div>
					{childElement?.props.children}
					{footer && <div className="mt-2">{footer}</div>}
				</>
			),
		},
	})

	return renderElement
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
