import { observer } from 'mobx-react-lite'
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
	syncStore,
	togglePlayback,
} from './sync'
import {
	clock,
	controlState,
	getTimeElapsedAsDuration,
	setTextSize,
	TEXT_SIZES,
} from './utils'

const IconTextButton = ({ icon, text, onClick }: any) => {
	return (
		<button
			className="relative h-10 w-10 text-gray-200 hover:text-white active:text-white"
			onClick={onClick}
		>
			<div className="absolute top-0 left-0 right-0 flex justify-center">
				{icon}
			</div>
			<div className="absolute bottom-0.5 left-0 right-0 text-center text-xs">
				{text}
			</div>
		</button>
	)
}

const TextButton = ({ children, onClick }: any) => {
	return (
		<button
			className="relative flex h-10 w-10 items-center justify-center text-gray-200 hover:text-white active:text-white"
			onClick={onClick}
		>
			{children}
		</button>
	)
}

export const Controls = observer(() => {
	useEffect(() => {
		if (document.fullscreenEnabled) {
			controlState.enableFullScreenButton()
		}
	}, [])

	useEffect(() => {
		if (!controlState.isOpen || controlState.faded) return
		const timer = window.setTimeout(() => {
			controlState.faded = true
			// Blur the active element so keyboard focus doesn't land on a hidden control
			if (document.activeElement instanceof HTMLElement) {
				document.activeElement.blur()
			}
		}, 5000)
		return () => window.clearTimeout(timer)
	}, [controlState.isOpen, controlState.faded, controlState.activity])

	return (
		<>
			<div
				className={cn(
					'absolute left-0 right-0 top-0 bg-linear-to-b from-black to-transparent pb-8 pl-safe pr-safe pt-safe transition-opacity duration-500',
					controlState.isOpen && controlState.faded && 'pointer-events-none opacity-0',
				)}
				onPointerDown={() => controlState.poke()}
			>
				<div className="flex">
					<Show when={() => controlState.isOpen}>
						{/* go back button */}
						<Link
							to="/"
							aria-label="Back to file list"
							className="flex h-10 w-10 flex-none items-center justify-center text-gray-200 hover:text-white active:text-white"
						>
							<GoBackIcon />
						</Link>
					</Show>

					<div className="flex-1"></div>

				<Show when={() => controlState.isOpen}>
					{/* transcript button */}
					<button
						onClick={() => controlState.toggleTranscript()}
						aria-label="Toggle transcript"
						className="flex h-10 w-10 flex-none items-center justify-center text-gray-200 hover:text-white active:text-white"
					>
						<TranscriptIcon />
					</button>
				</Show>

				<Show when={() => controlState.isOpen}>
					{/* device sync button */}
					<Link
						to="/sync"
						aria-label="Device sync"
						className="relative flex h-10 w-10 flex-none items-center justify-center text-gray-200 hover:text-white active:text-white"
					>
						<SyncIcon />
						<Show when={() => syncStore.connectionState === 'connected'}>
							<span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-green-500" />
						</Show>
						<Show when={() => syncStore.connectionState === 'connecting'}>
							<span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-yellow-500" />
						</Show>
						<Show when={() => syncStore.connectionState === 'error'}>
							<span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
						</Show>
					</Link>
				</Show>

					<Show when={() => controlState.showFullScreenButton}>
						{/* full screen button (for Android) */}
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
							className="flex h-10 w-10 flex-none items-center justify-center text-gray-200 hover:text-white active:text-white"
						>
							<FullScreenIcon />
						</button>
					</Show>

					{/* toggle menu */}
					<button
						onClick={controlState.toggle}
						aria-label={controlState.isOpen ? 'Hide controls' : 'Show controls'}
						className="flex h-10 w-10 flex-none items-center justify-center text-gray-200 hover:text-white active:text-white"
					>
						<MenuIcon />
					</button>
				</div>
			</div>

			<Show when={() => controlState.isOpen}>
				<div
					className={cn(
						'absolute bottom-0 left-0 right-0 bg-linear-to-t from-black to-transparent pt-16 pl-safe pr-safe pb-safe transition-opacity duration-500',
						controlState.faded && 'pointer-events-none opacity-0',
					)}
					onPointerDown={() => controlState.poke()}
				>
					<div className="mx-auto flex max-w-sm flex-col flex-wrap items-stretch justify-center gap-2 sm:max-w-none sm:flex-row sm:items-center">
						<div className="flex items-center justify-between sm:justify-center">
							<NumberInput
								value={() => getTimeElapsedAsDuration().hours}
								padWidth={2}
								suffix="h"
								onChange={(value) => {
									const duration = getTimeElapsedAsDuration().set({
										hours: value,
									})
									seekTo(duration.toMillis())
								}}
							/>

							<NumberInput
								value={() => getTimeElapsedAsDuration().minutes}
								padWidth={2}
								suffix="m"
								onChange={(value) => {
									const duration = getTimeElapsedAsDuration().set({
										minutes: value,
									})
									seekTo(duration.toMillis())
								}}
							/>

							<NumberInput
								value={() => getTimeElapsedAsDuration().seconds}
								padWidth={2}
								suffix="s"
								onChange={(value) => {
									const duration = getTimeElapsedAsDuration().set({
										seconds: value,
									})
									seekTo(duration.toMillis())
								}}
							/>

							<NumberInput
								className="w-20"
								padWidth={3}
								value={() => getTimeElapsedAsDuration().milliseconds}
								suffix="ms"
								onChange={(value) => {
									const duration = getTimeElapsedAsDuration().set({
										milliseconds: value,
									})
									seekTo(duration.toMillis())
								}}
							/>
						</div>

						<div className="w-full">
							<Timeline />
						</div>

						<div className="flex items-center justify-between sm:justify-center">
							<IconTextButton
								icon={<LeftIcon />}
								text={'10s'}
								onClick={() => seekBy(-10000)}
							/>

							<IconTextButton
								icon={<LeftIcon />}
								text={'1s'}
								onClick={() => seekBy(-1000)}
							/>

							<IconTextButton
								icon={<LeftIcon />}
								text={'0.1s'}
								onClick={() => seekBy(-100)}
							/>

							<button
								className="flex h-10 w-10 items-center justify-center text-gray-200 hover:text-white active:text-white"
								onClick={togglePlayback}
								aria-label={clock.isPlaying ? 'Pause' : 'Play'}
							>
								{clock.isPlaying ? <PauseIcon /> : <PlayIcon />}
							</button>

							<IconTextButton
								icon={<RightIcon />}
								text={'0.1s'}
								onClick={() => seekBy(100)}
							/>

							<IconTextButton
								icon={<RightIcon />}
								text={'1s'}
								onClick={() => seekBy(1000)}
							/>

							<IconTextButton
								icon={<RightIcon />}
								text={'10s'}
								onClick={() => seekBy(10000)}
							/>
						</div>

						{/* text size */}
						<div className="flex items-center justify-between sm:justify-center">
						<NumberInput
							value={() => clock.playSpeed}
							suffix="x"
							onChange={(value) => {
								if (Number.isFinite(value) && value > 0) {
									setPlaySpeed(value)
								}
							}}
						/>
							<TextButton onClick={() => setTextSize(TEXT_SIZES[0])}>
								XS
							</TextButton>
							<TextButton onClick={() => setTextSize(TEXT_SIZES[1])}>
								SM
							</TextButton>
							<TextButton onClick={() => setTextSize(TEXT_SIZES[2])}>
								MD
							</TextButton>
							<TextButton onClick={() => setTextSize(TEXT_SIZES[3])}>
								LG
							</TextButton>
						</div>
					</div>
				</div>
			</Show>
		</>
	)
})
