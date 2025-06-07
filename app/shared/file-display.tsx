import { controlState, getActiveNodes, getFile, getTimeElapsed } from './utils'
import { Subtitle } from './subtitle'

export const FileDisplay = () => {
	return (
		<Show when={() => !controlState.showTranscript}>
			<div className="absolute left-0 right-0 -top-full -bottom-full">
				<div className="flex h-full flex-col justify-center pl-[env(safe-area-inset-left,0)] pr-[env(safe-area-inset-right,0)] text-center">
					<div className="px-2">
						<For each={() => getActiveNodes(getFile(), getTimeElapsed())}>
							{(node) => <Subtitle key={node.id} node={node} />}
						</For>
					</div>
					{/* <div>{props.file?.name ?? 'unknown name'}</div> */}
					{/* <div>{nodes()?.length ? `${nodes()?.length} lines` : 'no file'}</div> */}
				</div>
			</div>
		</Show>
	)
}
