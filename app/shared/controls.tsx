import { useSnapshot } from 'valtio'
import { Link } from 'react-router'
import {
	FullScreenIcon,
	GoBackIcon,
	LeftIcon,
	MenuIcon,
	PauseIcon,
	PlayIcon,
	RightIcon,
	SyncIcon,
	TranscriptIcon,
} from './icons'
import { NumberInput } from './text-input'
import {
	seekBy,
	seekTo,
	setPlaySpeed,
	syncState,
	syncStore,
	togglePlayback,
} from './sync'
import {
	clock,
	controlState,
	enableFullScreenButton,
	getTimeElapsedAsDuration,
	pokeControls,
	setTextSize,
	TEXT_SIZES,
	toggleControls,
	toggleTranscript,
} from './utils'

const IconTextButton = ({
	icon,
	text,
	onClick,
	label,
}: {
	icon: React.ReactNode
	text: string
	onClick?: () => void
	label: string
}) => {
	return (
		<button
			aria-label={label}
			className="relative flex h-11 w-11 flex-none items-center justify-center rounded-control text-ink-300 transition-colors duration-150 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-600 active:text-white"
			onClick={onClick}
		>
			{icon}
			<span className="absolute bottom-0.5 left-0 right-0 text-center text-[10px] leading-none">
				{text}
			</span>
		</button>
	)
}

const TextButton = ({
	children,
	onClick,
	label,
}: {
	children: React.ReactNode
	onClick?: () => void
	label: string
}) => {
	return (
		<button
			aria-label={label}
			className="relative flex h-11 w-11 flex-none items-center justify-center rounded-control text-ink-300 transition-colors duration-150 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-600 active:text-white"
			onClick={onClick}
		>
			{children}
		</button>
	)
}

/** A real readout: the current time as text, not four tappable steppers. */
const TimeReadout = () => {
	const clockSnap = useSnapshot(clock)
	const d = getTimeElapsedAsDuration(clockSnap.actualTimeElapsedMs)
	const text = `${d.hours}h ${d.minutes}m ${d.seconds}s`
	return (
		<div className="flex h-10 flex-none items-center justify-center gap-2">
			<span className="font-mono text-sm tabular-nums text-ink-100">
				{text}
			</span>
		</div>
	)
}

export const Controls = () => {
	const controlSnap = useSnapshot(controlState)
	const syncSnap = useSnapshot(syncState)
	const clockSnap = useSnapshot(clock)

	useEffect(() => {
		if (document.fullscreenEnabled) {
			enableFullScreenButton()
		}
	}, [])

	useEffect(() => {
		if (!controlSnap.isOpen || controlSnap.faded) return
		const timer = window.setTimeout(() => {
			controlState.faded = true
			// Blur the active element so keyboard focus doesn't land on a hidden control
			if (document.activeElement instanceof HTMLElement) {
				document.activeElement.blur()
			}
		}, 5000)
		return () => window.clearTimeout(timer)
	}, [controlSnap.isOpen, controlSnap.faded, controlSnap.activity])

	return (
		<>
			<div
				className={cn(
					'absolute left-0 right-0 top-0 bg-linear-to-b from-black to-transparent pb-8 pl-safe pr-safe pt-safe transition-opacity duration-500',
					controlSnap.isOpen &&
						controlSnap.faded &&
						'pointer-events-none opacity-0',
				)}
				onPointerDown={pokeControls}
			>
				<div className="flex items-center">
					{controlSnap.isOpen && (
						/* go back button */
						<Link
							to="/"
							aria-label="Back to file list"
							className="flex h-11 w-11 flex-none items-center justify-center rounded-control text-ink-300 transition-colors duration-150 hover:text-white active:text-white"
						>
							<GoBackIcon />
						</Link>
					)}

					<div className="flex-1"></div>

					{controlSnap.isOpen && (
						/* transcript button */
						<button
							onClick={toggleTranscript}
							aria-label="Toggle transcript"
							className="flex h-11 w-11 flex-none items-center justify-center rounded-control text-ink-300 transition-colors duration-150 hover:text-white active:text-white"
						>
							<TranscriptIcon />
						</button>
					)}

					{controlSnap.isOpen && (
						/* device sync button */
						<Link
							to="/sync"
							aria-label="Device sync"
							className="relative flex h-11 w-11 flex-none items-center justify-center rounded-control text-ink-300 transition-colors duration-150 hover:text-white active:text-white"
						>
							<SyncIcon />
							{syncSnap.connectionState === 'connected' && (
								<span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-ok" />
							)}
							{syncSnap.connectionState === 'connecting' && (
								<span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-warn" />
							)}
							{syncSnap.connectionState === 'error' && (
								<span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-danger" />
							)}
						</Link>
					)}

					{controlSnap.isOpen && controlSnap.fullScreenEnabled && (
						/* full screen button (for Android) */
						<button
							onClick={() => {
								let elem = document.getElementById('app')

								if (!elem) throw new Error('cannot find #app element!')

								if (!document.fullscreenElement) {
									elem
										.requestFullscreen({
											navigationUI: 'hide',
										})
										.catch((err) => {
											alert(
												`Error attempting to enable full-screen mode: ${err.message} (${err.name})`,
											)
										})
								} else {
									document.exitFullscreen()
								}
							}}
							aria-label="Toggle fullscreen"
							className="flex h-11 w-11 flex-none items-center justify-center rounded-control text-ink-300 transition-colors duration-150 hover:text-white active:text-white"
						>
							<FullScreenIcon />
						</button>
					)}

					{/* toggle menu */}
					<button
						onClick={toggleControls}
						aria-label={controlSnap.isOpen ? 'Hide controls' : 'Show controls'}
						className="flex h-11 w-11 flex-none items-center justify-center rounded-control text-ink-300 transition-colors duration-150 hover:text-white active:text-white"
					>
						<MenuIcon />
					</button>
				</div>
			</div>

			{controlSnap.isOpen && (
				<div
					className={cn(
						'absolute bottom-0 left-0 right-0 bg-linear-to-t from-black to-transparent pt-16 pl-safe pr-safe pb-safe transition-opacity duration-500',
						controlSnap.faded && 'pointer-events-none opacity-0',
					)}
					onPointerDown={pokeControls}
				>
					<div className="mx-auto flex max-w-sm flex-col flex-wrap items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
						{/* time readout + seek */}
						<div className="flex flex-col items-center gap-1">
							<TimeReadout />
							<div className="w-full">
								<Timeline />
							</div>
						</div>

						{/* transport cluster */}
						<div className="flex items-center justify-center">
							<IconTextButton
								icon={<LeftIcon />}
								text={'10s'}
								label="Back 10 seconds"
								onClick={() => seekBy(-10000)}
							/>

							<IconTextButton
								icon={<LeftIcon />}
								text={'1s'}
								label="Back 1 second"
								onClick={() => seekBy(-1000)}
							/>

							<IconTextButton
								icon={<LeftIcon />}
								text={'0.1s'}
								label="Back 0.1 seconds"
								onClick={() => seekBy(-100)}
							/>

							<button
								className="flex h-12 w-12 items-center justify-center rounded-control text-white transition-colors duration-150 hover:text-white active:text-white"
								onClick={togglePlayback}
								aria-label={clockSnap.isPlaying ? 'Pause' : 'Play'}
							>
								{clockSnap.isPlaying ? <PauseIcon /> : <PlayIcon />}
							</button>

							<IconTextButton
								icon={<RightIcon />}
								text={'0.1s'}
								label="Forward 0.1 seconds"
								onClick={() => seekBy(100)}
							/>

							<IconTextButton
								icon={<RightIcon />}
								text={'1s'}
								label="Forward 1 second"
								onClick={() => seekBy(1000)}
							/>

							<IconTextButton
								icon={<RightIcon />}
								text={'10s'}
								label="Forward 10 seconds"
								onClick={() => seekBy(10000)}
							/>
						</div>

						{/* speed + text size */}
						<div className="flex items-center justify-center">
							<NumberInput
								value={clockSnap.playSpeed}
								suffix="x"
								onChange={(value) => {
									if (Number.isFinite(value) && value > 0) {
										setPlaySpeed(value)
									}
								}}
							/>
							<TextButton
								label="Small text"
								onClick={() => setTextSize(TEXT_SIZES[0])}
							>
								XS
							</TextButton>
							<TextButton
								label="Medium text"
								onClick={() => setTextSize(TEXT_SIZES[1])}
							>
								SM
							</TextButton>
							<TextButton
								label="Large text"
								onClick={() => setTextSize(TEXT_SIZES[2])}
							>
								MD
							</TextButton>
							<TextButton
								label="Extra large text"
								onClick={() => setTextSize(TEXT_SIZES[3])}
							>
								LG
							</TextButton>
						</div>
					</div>
				</div>
			)}
		</>
	)
}
