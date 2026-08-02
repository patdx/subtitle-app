import { controlState, getActiveNodes, getFile, getTimeElapsed } from './utils'
import { Subtitle } from './subtitle'

export const FileDisplay = () => {
	return (
		<Show when={() => !controlState.showTranscript}>
			<div className="absolute left-0 right-0 -top-full -bottom-full">
				<div className="flex h-full flex-col justify-center pl-safe pr-safe text-center">
					<div className="px-2">
						<For each={() => getActiveNodes(getFile(), getTimeElapsed())}>
							{(node) => <Subtitle key={node.id} node={node} />}
						</For>
					</div>
				</div>
			</div>
		</Show>
	)
}
