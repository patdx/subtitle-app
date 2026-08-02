import { useSnapshot } from 'valtio'
import { TimeDisplay } from './subtitle'
import { clock, getDuration, setClock, toggleIsPlaying, uiState } from './utils'

export const Timeline = () => {
	const uiSnap = useSnapshot(uiState)
	const clockSnap = useSnapshot(clock)
	const wasPlaying = useRef(false)

	const duration = getDuration(uiSnap.file)
	if (!duration || duration <= 0) return null

	const elapsed = Math.min(clockSnap.actualTimeElapsedMs, duration)
	const percent = (elapsed / duration) * 100

	const handlePointerDown = () => {
		wasPlaying.current = clock.isPlaying
		if (clock.isPlaying) {
			toggleIsPlaying(false)
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
			toggleIsPlaying(true)
		}
	}

	return (
		<div className="flex w-full flex-col gap-1">
			<div className="flex items-center justify-between text-xs text-ink-300">
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
					background: `linear-gradient(to right, rgb(226 232 240) 0%, rgb(226 232 240) ${percent}%, rgb(55 65 81) ${percent}%, rgb(55 65 81) 100%)`,
				}}
			/>
		</div>
	)
}
