import { observer } from 'mobx-react-lite'
import { TimeDisplay } from './subtitle'
import { clock, getDuration, getTimeElapsed, setClock } from './utils'

export const Timeline = observer(() => {
	const wasPlaying = useRef(false)

	const duration = getDuration()
	if (!duration || duration <= 0) return null

	const elapsed = Math.min(getTimeElapsed(), duration)
	const percent = (elapsed / duration) * 100

	const handlePointerDown = () => {
		wasPlaying.current = clock.isPlaying
		if (clock.isPlaying) {
			clock.toggleIsPlaying(false)
		}
	}

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setClock({
			lastActionAt: Date.now(),
			lastTimeElapsedMs: Number(e.target.value),
		})
	}

	const handlePointerUp = () => {
		if (wasPlaying.current) {
			clock.toggleIsPlaying(true)
		}
	}

	return (
		<div className="flex w-full flex-col gap-1">
			<div className="flex items-center justify-between text-xs text-gray-300">
				<TimeDisplay ms={elapsed} />
				<TimeDisplay ms={duration} />
			</div>
			<input
				type="range"
				min={0}
				max={duration}
				step={100}
				value={elapsed}
				onPointerDown={handlePointerDown}
				onChange={handleChange}
				onPointerUp={handlePointerUp}
				onPointerCancel={handlePointerUp}
				aria-label="Seek timeline"
				className="subtitle-timeline w-full cursor-pointer"
				style={{
					touchAction: 'none',
					background: `linear-gradient(to right, rgb(203 213 225) 0%, rgb(203 213 225) ${percent}%, rgb(55 65 81) ${percent}%, rgb(55 65 81) 100%)`,
				}}
			/>
		</div>
	)
})
