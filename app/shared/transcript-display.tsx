import { useSnapshot } from 'valtio'
import { controlState, toggleTranscript, uiState } from './utils'
import { Subtitle } from './subtitle'

export const TranscriptDisplay = () => {
	const controlSnap = useSnapshot(controlState)
	const uiSnap = useSnapshot(uiState)

	if (!controlSnap.showTranscript) return null

	return (
		<div className="absolute inset-0 overflow-auto bg-ink-950/90">
			<div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-ink-950/95 px-4 py-3 pl-safe pr-safe">
				<span className="text-sm font-semibold text-white">Transcript</span>
				<button
					onClick={toggleTranscript}
					aria-label="Close transcript"
					className="flex h-11 w-11 items-center justify-center rounded-control text-ink-300 transition-colors duration-150 hover:text-white"
				>
					Close
				</button>
			</div>
			<div className="min-h-full px-4 py-20">
				<div className="space-y-4">
					{(uiSnap.file ?? []).map((node) => (
						<Subtitle key={node.id} node={node} showTime />
					))}
				</div>
			</div>
		</div>
	)
}
