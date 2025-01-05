import { once } from 'lodash-es'
import {
	clock,
	getTimeElapsed,
	getTimeElapsedAsDuration,
	setClock,
	setTextSize,
	TEXT_SIZES,
} from './utils'
import {
	FullScreenIcon,
	GoBackIcon,
	LeftIcon,
	MenuIcon,
	PauseIcon,
	PlayIcon,
	RightIcon,
} from './icons'
import { NumberInput } from './text-input'
import { Link } from 'react-router'
import { observer } from 'mobx-react-lite'

const getNoSleep = once(async () => {
	const { default: NoSleep } = await import('nosleep.js')
	return new NoSleep()
})

function enableNoSleep() {
	getNoSleep().then((ns) => ns.enable())
}

function disableNoSleep() {
	getNoSleep().then((ns) => ns.disable())
}

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
	const [isOpen, setIsOpen] = useSignal(true)

	return (
		<>
			<div className="absolute left-0 right-0 top-0 bg-gradient-to-b from-black to-transparent pb-8 pl-[env(safe-area-inset-left,0)] pr-[env(safe-area-inset-right,0)]">
				{/* padding for iOS */}
				<div className="h-[env(safe-area-inset-top,0)]"></div>
				<div className="flex">
					<Show when={isOpen}>
						{/* go back button */}
						<Link
							to="/"
							className="flex h-10 w-10 flex-none items-center justify-center text-gray-200 hover:text-white active:text-white"
						>
							<GoBackIcon />
						</Link>
					</Show>

					<div className="flex-1"></div>

					<Show when={isOpen}>
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
							className="flex h-10 w-10 flex-none items-center justify-center text-gray-200 hover:text-white active:text-white"
						>
							<FullScreenIcon />
						</button>
					</Show>

					{/* toggle menu */}
					<button
						onClick={() => setIsOpen((isOpen) => !isOpen)}
						className="flex h-10 w-10 flex-none items-center justify-center text-gray-200 hover:text-white active:text-white"
					>
						<MenuIcon />
					</button>
				</div>
			</div>

			<Show when={isOpen}>
				<div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent pt-16 pl-[env(safe-area-inset-left,0)] pr-[env(safe-area-inset-right,0)]">
					<div className="mx-auto flex max-w-sm flex-col flex-wrap items-stretch justify-center gap-2 sm:max-w-none sm:flex-row sm:items-center">
						<div className="flex items-center justify-between sm:justify-center">
							<NumberInput
								value={() => getTimeElapsedAsDuration().hours}
								padWidth={2}
								suffix="h"
								onChange={(value) => {
									console.log('new hours', value)
									const duration = getTimeElapsedAsDuration().set({
										hours: value,
									})
									setClock({
										lastActionAt: new Date(),
										lastTimeElapsedMs: duration.toMillis(),
									})
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
									setClock({
										lastActionAt: new Date(),
										lastTimeElapsedMs: duration.toMillis(),
									})
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
									setClock({
										lastActionAt: new Date(),
										lastTimeElapsedMs: duration.toMillis(),
									})
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
									setClock({
										lastActionAt: new Date(),
										lastTimeElapsedMs: duration.toMillis(),
									})
								}}
							/>
						</div>

						<div className="flex items-center justify-between sm:justify-center">
							<IconTextButton
								icon={<LeftIcon />}
								text={'1s'}
								onClick={() => {
									setClock({
										lastActionAt: new Date(),
										lastTimeElapsedMs: getTimeElapsed() - 1000,
									})
								}}
							/>

							<IconTextButton
								icon={<LeftIcon />}
								text={'0.1s'}
								onClick={() => {
									setClock({
										lastActionAt: new Date(),
										lastTimeElapsedMs: getTimeElapsed() - 100,
									})
								}}
							/>

							<button
								className="flex h-10 w-10 items-center justify-center text-gray-200 hover:text-white active:text-white"
								onClick={async () => {
									const isPlaying = !clock.isPlaying

									if (isPlaying) {
										enableNoSleep()
									} else {
										disableNoSleep()
									}

									setClock({
										lastActionAt: new Date(),
										// todo: recalculate at time of action
										// instead of using Signal
										lastTimeElapsedMs: getTimeElapsed(),
										isPlaying,
									})
								}}
							>
								{clock.isPlaying ? <PauseIcon /> : <PlayIcon />}
							</button>

							<IconTextButton
								icon={<RightIcon />}
								text={'0.1s'}
								onClick={() => {
									setClock({
										lastActionAt: new Date(),
										lastTimeElapsedMs: getTimeElapsed() + 100,
									})
								}}
							/>

							<IconTextButton
								icon={<RightIcon />}
								text={'1s'}
								onClick={() => {
									setClock({
										lastActionAt: new Date(),
										lastTimeElapsedMs: getTimeElapsed() + 1000,
									})
								}}
							/>
						</div>

						{/* text size */}
						<div className="flex items-center justify-between sm:justify-center">
							<NumberInput
								value={() => clock.playSpeed}
								suffix="x"
								onChange={(value) => {
									const newPlaySpeed =
										typeof value === 'string' ? parseFloat(value) : undefined

									if (Number.isFinite(newPlaySpeed)) {
										setClock({
											playSpeed: newPlaySpeed,
											lastActionAt: new Date(),
											lastTimeElapsedMs: getTimeElapsed(),
										})
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

					{/* padding */}
					<div className="h-[env(safe-area-inset-bottom,0)]"></div>
				</div>
			</Show>
		</>
	)
})
