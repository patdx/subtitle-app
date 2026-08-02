import { useSnapshot } from 'valtio'
import { clock, controlState, getActiveNodes, uiState } from './utils'
import { Subtitle } from './subtitle'

export const FileDisplay = () => {
	const controlSnap = useSnapshot(controlState)
	const uiSnap = useSnapshot(uiState)
	const clockSnap = useSnapshot(clock)

	if (controlSnap.showTranscript) return null

	return (
		<div className="subtitle-stage absolute left-0 right-0 -top-full -bottom-full">
			<div className="flex h-full flex-col justify-center pl-safe pr-safe text-center">
				<div className="px-2">
					{getActiveNodes(uiSnap.file, clockSnap.actualTimeElapsedMs).map(
						(node) => (
							<Subtitle key={node.id} node={node} />
						),
					)}
				</div>
			</div>
		</div>
	)
}
