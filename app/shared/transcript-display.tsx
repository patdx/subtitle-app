import { useSnapshot } from 'valtio'
import { controlState, toggleTranscript, uiState } from './utils'
import { Subtitle } from './subtitle'
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from '~/components/ui/sheet'

export const TranscriptDisplay = () => {
	const controlSnap = useSnapshot(controlState)
	const uiSnap = useSnapshot(uiState)

	return (
		<Sheet
			open={controlSnap.showTranscript}
			onOpenChange={(open) => {
				if (!open) toggleTranscript()
			}}
		>
			<SheetContent
				side="right"
				showCloseButton={false}
				className="w-full! border-l-0 bg-ink-950 text-white sm:max-w-none!"
			>
				<SheetHeader className="flex flex-row items-center justify-between gap-0 border-b border-white/10 px-4 py-3 pl-safe pr-safe">
					<SheetTitle className="text-sm font-semibold text-white">
						Transcript
					</SheetTitle>
					<button
						onClick={toggleTranscript}
						aria-label="Close transcript"
						className="flex h-11 w-11 items-center justify-center rounded-control text-ink-300 transition-colors duration-150 hover:text-white"
					>
						Close
					</button>
				</SheetHeader>
				<div className="flex-1 overflow-y-auto px-4 py-20">
					<div className="space-y-4">
						{(uiSnap.file ?? []).map((node) => (
							<Subtitle key={node.id} node={node} showTime />
						))}
					</div>
				</div>
			</SheetContent>
		</Sheet>
	)
}
