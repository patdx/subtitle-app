import { useSnapshot } from 'valtio'
import {
	clock,
	controlState,
	nodeIsActive,
	sanitizeSubtitleHtml,
	toggleTranscript,
	uiState,
	type Entry,
} from './utils'
import { seekTo } from './sync'
import { TimeDisplay } from './subtitle'
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from '~/components/ui/sheet'
import PhX from '~icons/ph/x'

export const TranscriptDisplay = () => {
	const controlSnap = useSnapshot(controlState)
	const uiSnap = useSnapshot(uiState)
	const clockSnap = useSnapshot(clock)
	const listRef = useRef<HTMLDivElement>(null)
	const activeRef = useRef<HTMLButtonElement | null>(null)
	const lastScrolledId = useRef<string | null>(null)

	const lines = uiSnap.file ?? []
	const nowMs = clockSnap.actualTimeElapsedMs

	const activeId =
		lines.find((node) => nodeIsActive(node, nowMs))?.id ??
		lines.find((node) => node.from > nowMs)?.id ??
		lines[lines.length - 1]?.id ??
		null

	useEffect(() => {
		if (!controlSnap.showTranscript || !activeId) return
		if (lastScrolledId.current === activeId) return
		lastScrolledId.current = activeId
		activeRef.current?.scrollIntoView({
			block: 'center',
			behavior: 'smooth',
		})
	}, [activeId, controlSnap.showTranscript])

	useEffect(() => {
		if (!controlSnap.showTranscript) {
			lastScrolledId.current = null
		}
	}, [controlSnap.showTranscript])

	const seekToLine = (node: Entry) => {
		seekTo(node.from)
	}

	return (
		<Sheet
			open={controlSnap.showTranscript}
			onOpenChange={(open) => {
				if (!open) toggleTranscript()
			}}
		>
			<SheetContent
				side="bottom"
				showCloseButton={false}
				className="h-[min(85dvh,100%)] gap-0 border-t border-white/10 bg-ink-950 p-0 text-white sm:max-w-none!"
			>
				<SheetHeader className="flex flex-row items-center justify-between gap-3 border-b border-white/10 px-4 py-3 pl-safe pr-safe">
					<SheetTitle className="text-sm font-semibold text-white">
						Transcript
					</SheetTitle>
					<button
						type="button"
						onClick={toggleTranscript}
						aria-label="Close transcript"
						className="flex h-11 w-11 items-center justify-center rounded-control text-ink-300 transition-colors duration-150 hover:text-white"
					>
						<PhX className="!size-5" />
					</button>
				</SheetHeader>
				<div
					ref={listRef}
					className="min-h-0 flex-1 overflow-y-auto px-4 pb-safe-or-6 pt-3 pl-safe pr-safe"
				>
					<div className="mx-auto flex w-full max-w-xl flex-col gap-1">
						{lines.map((node) => {
							const isActive = node.id === activeId
							return (
								<button
									key={node.id}
									ref={isActive ? activeRef : undefined}
									type="button"
									onClick={() => seekToLine(node)}
									aria-current={isActive ? 'true' : undefined}
									className={cn(
										'w-full rounded-control px-3 py-2.5 text-left transition-colors',
										isActive
											? 'bg-white/10 text-white'
											: 'text-ink-300 hover:bg-white/5 hover:text-white',
									)}
								>
									<TimeDisplay
										ms={node.from}
										className={cn(
											'mb-1 block text-[11px] tabular-nums',
											isActive ? 'text-ember-500' : 'text-ink-500',
										)}
									/>
									<div
										className={cn(
											'subtitle-text text-base leading-snug',
											isActive && 'font-semibold',
										)}
										dangerouslySetInnerHTML={{
											__html: sanitizeSubtitleHtml(node.text),
										}}
									/>
								</button>
							)
						})}
					</div>
				</div>
			</SheetContent>
		</Sheet>
	)
}
