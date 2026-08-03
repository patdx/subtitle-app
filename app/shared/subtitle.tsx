import { useSnapshot } from 'valtio'
import {
	clock,
	cn,
	nodeIsActive,
	sanitizeSubtitleHtml,
	uiState,
	type Entry,
} from './utils'

const formatTime = (ms: number): string => {
	const totalSeconds = Math.floor(ms / 1000)
	const minutes = Math.floor(totalSeconds / 60)
	const seconds = totalSeconds % 60
	return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

export const TimeDisplay = (props: { ms: number; className?: string }) => {
	return (
		<span className={cn('font-mono', props.className)}>
			{formatTime(props.ms)}
		</span>
	)
}

export const Subtitle = (props: { node: Entry }) => {
	const uiSnap = useSnapshot(uiState)
	const clockSnap = useSnapshot(clock)
	return (
		<div className="flex flex-col items-center">
			<div
				className={cn(
					`subtitle-text text-white`,
					uiSnap.textSize,
					nodeIsActive(props.node, clockSnap.actualTimeElapsedMs) &&
						'font-bold',
				)}
				dangerouslySetInnerHTML={{
					__html: sanitizeSubtitleHtml(props.node.text),
				}}
			/>
		</div>
	)
}
