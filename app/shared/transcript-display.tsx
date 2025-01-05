import { observer } from 'mobx-react-lite'
import { controlState, getFile } from './utils'
import { Subtitle } from './subtitle'

export const TranscriptDisplay = observer(() => {
	return (
		<Show when={() => controlState.showTranscript}>
			<div className="absolute inset-0 bg-black/80 overflow-auto">
				<div className="min-h-full px-4 py-20">
					<div className="space-y-4">
						<For each={() => getFile()}>
							{(node) => <Subtitle key={node.id} node={node} showTime />}
						</For>
					</div>
				</div>
			</div>
		</Show>
	)
})
