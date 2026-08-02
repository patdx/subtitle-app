import { useRef } from 'react'
import { useEffect, useState } from 'react'

/**
 * A minimal popover menu. The trigger button and the panel are wired together
 * via context-free prop passing; the panel closes on outside click or Escape.
 */
export const Menu = function Menu({
	trigger,
	children,
}: {
	trigger: (open: boolean, toggle: () => void) => React.ReactNode
	children: (close: () => void) => React.ReactNode
}) {
	const [open, setOpen] = useState(false)
	const rootRef = useRef<HTMLDivElement>(null)

	const toggle = () => setOpen((value) => !value)
	const close = () => setOpen(false)

	useEffect(() => {
		if (!open) return
		const onPointerDown = (e: PointerEvent) => {
			if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
				close()
			}
		}
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') close()
		}
		document.addEventListener('pointerdown', onPointerDown)
		document.addEventListener('keydown', onKeyDown)
		return () => {
			document.removeEventListener('pointerdown', onPointerDown)
			document.removeEventListener('keydown', onKeyDown)
		}
	}, [open])

	return (
		<div ref={rootRef} className="relative">
			{trigger(open, toggle)}
			{open && (
				<div className="absolute right-0 top-full z-20 mt-1 min-w-44 overflow-hidden rounded-panel border border-edge bg-paper-raised py-1 shadow-lg">
					{children(close)}
				</div>
			)}
		</div>
	)
}

export function MenuAction({
	children,
	onClick,
	danger = false,
}: {
	children: React.ReactNode
	onClick?: () => void
	danger?: boolean
}) {
	return (
		<button
			type="button"
			className={cn(
				'flex w-full items-center px-3 py-2 text-left text-sm transition-colors',
				danger
					? 'text-danger hover:bg-danger-soft'
					: 'text-ink-900 hover:bg-ink-50',
			)}
			onClick={(e) => {
				// The menu lives inside a card link; keep the click from navigating.
				e.preventDefault()
				e.stopPropagation()
				onClick?.()
			}}
		>
			{children}
		</button>
	)
}
