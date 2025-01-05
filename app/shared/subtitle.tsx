import { getTextSize, getTimeElapsed, nodeIsActive, type Entry } from './utils'
import { observer } from 'mobx-react-lite'

const formatTime = (ms: number): string => {
	const totalSeconds = Math.floor(ms / 1000)
	const minutes = Math.floor(totalSeconds / 60)
	const seconds = totalSeconds % 60
	return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

export const TimeDisplay = observer(
	(props: { ms: number; className?: string }) => {
		return (
			<span className={cn('font-mono', props.className)}>
				{formatTime(props.ms)}
			</span>
		)
	},
)

export const Subtitle = observer(
	(props: { node: Entry; showTime?: boolean }) => {
		props.node.from
		return (
			<div className="flex flex-col items-center">
				{props.showTime && (
					<TimeDisplay
						ms={props.node.from}
						className="text-xs text-gray-400 mb-1"
					/>
				)}
				<div
					className={cn(
						`text-white`,
						getTextSize(),
						nodeIsActive(props.node, getTimeElapsed()) && 'font-bold',
					)}
					dangerouslySetInnerHTML={{ __html: props.node.text }}
				/>
			</div>
		)
	},
)
