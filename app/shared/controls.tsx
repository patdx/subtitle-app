import { useSnapshot } from 'valtio'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '~/components/ui/tooltip'
import {
	FullScreenIcon,
	GoBackIcon,
	SettingsIcon,
	SpeakerIcon,
	TranscriptIcon,
} from './icons'
import { DevicesMenu } from './device-picker'
import { setPlaySpeed, syncState, syncStore } from './sync'
import { TransportCluster } from './transport'
import {
	clock,
	controlState,
	enableFullScreenButton,
	getTextSize,
	pokeControls,
	setTextSize,
	TEXT_SIZES,
	toggleTranscript,
} from './utils'
import {
	MenuItem,
	MenuPopup,
	MenuPortal,
	MenuPositioner,
	MenuRoot,
	MenuSeparator,
	MenuSubRoot,
	MenuSubTrigger,
	MenuTrigger,
} from '~/components/ui/menu'
import { CheckIcon } from './icons'

export const Controls = () => {
	const controlSnap = useSnapshot(controlState)
	const clockSnap = useSnapshot(clock)
	const syncSnap = useSnapshot(syncState)

	useEffect(() => {
		if (document.fullscreenEnabled) {
			enableFullScreenButton()
		}
	}, [])

	useEffect(() => {
		// Test/debug hook: ?keep-ui-open=1 disables the auto-fade so the
		// controls stay visible while iterating on the layout.
		const keepOpen =
			new URL(location.href).searchParams.get('keep-ui-open') === '1'
		if (keepOpen || controlSnap.faded) return
		const timer = window.setTimeout(() => {
			controlState.faded = true
			// Blur the active element so keyboard focus doesn't land on a hidden control
			if (document.activeElement instanceof HTMLElement) {
				document.activeElement.blur()
			}
		}, 5000)
		return () => window.clearTimeout(timer)
	}, [controlSnap.faded, controlSnap.activity])

	return (
		<>
			<AnimatePresence initial={false}>
				{!controlSnap.faded && (
					<motion.div
						key="top-bar"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.25 }}
						className="absolute left-0 right-0 top-0 z-10 bg-linear-to-b from-black to-transparent pb-8 pl-safe pr-safe pt-safe"
						onPointerDown={pokeControls}
					>
						<div className="flex items-center">
							{/* go back button */}
							<Tooltip>
								<TooltipTrigger
									render={
										<Link
											to="/"
											aria-label="Back to file list"
											className="flex h-11 w-11 flex-none items-center justify-center rounded-control text-ink-300 transition-colors duration-150 hover:text-white active:text-white"
										>
											<GoBackIcon />
										</Link>
									}
								/>
								<TooltipContent>Back to file list</TooltipContent>
							</Tooltip>

							<div className="flex-1"></div>

							{/* play on this device (device picker) */}
							{syncSnap.role === 'peer' && (
								<DevicesMenu>
									<button
										type="button"
										aria-label="Play on this device"
										className="flex h-11 w-11 flex-none items-center justify-center rounded-control text-ink-300 transition-colors duration-150 hover:text-white active:text-white"
									>
										<SpeakerIcon />
									</button>
								</DevicesMenu>
							)}

							{/* transcript button */}
							<Tooltip>
								<TooltipTrigger
									render={
										<button
											onClick={toggleTranscript}
											aria-label="Toggle transcript"
											className="flex h-11 w-11 flex-none items-center justify-center rounded-control text-ink-300 transition-colors duration-150 hover:text-white active:text-white"
										>
											<TranscriptIcon />
										</button>
									}
								/>
								<TooltipContent>Toggle transcript</TooltipContent>
							</Tooltip>

							{controlSnap.fullScreenEnabled && (
								/* full screen button (for Android) */
								<Tooltip>
									<TooltipTrigger
										render={
											<button
												onClick={() => {
													let elem = document.getElementById('app')

													if (!elem)
														throw new Error('cannot find #app element!')

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
										}
									/>
									<TooltipContent>Toggle fullscreen</TooltipContent>
								</Tooltip>
							)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>

			<AnimatePresence initial={false}>
				{!controlSnap.faded && (
					<motion.div
						key="bottom-bar"
						initial={{ opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 12 }}
						transition={{ duration: 0.25 }}
						className="absolute bottom-0 left-0 right-0 z-10 bg-linear-to-t from-black to-transparent pt-16 pl-safe pr-safe pb-safe"
						onPointerDown={pokeControls}
					>
						{/* timeline: full-width row so the scrubber spans any screen */}
						<div className="w-full">
							<Timeline />
						</div>

						<div className="mx-auto mt-2 flex max-w-sm flex-col flex-wrap items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
							<TransportCluster />

							{/* settings: speed + subtitle size */}
							<div className="flex items-center justify-center">
								<MenuRoot>
									<MenuTrigger
										render={
											<button
												type="button"
												aria-label="Playback settings"
												className="flex h-12 w-12 flex-none items-center justify-center rounded-control text-ink-300 transition-colors duration-150 hover:text-white active:text-white"
											>
												<SettingsIcon />
											</button>
										}
									/>
									<MenuPortal>
										<MenuPositioner>
											<MenuPopup>
												{/* playback speed */}
												<MenuSubRoot>
													<MenuSubTrigger
														label="Playback speed"
														className="justify-between"
													>
														<span>Playback speed</span>
														<span className="text-ink-300">
															{clockSnap.playSpeed}x
														</span>
													</MenuSubTrigger>
													<MenuPortal>
														<MenuPositioner side="right" align="start">
															<MenuPopup>
																{[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
																	<MenuItem
																		key={speed}
																		onClick={() => setPlaySpeed(speed)}
																		className="justify-between"
																	>
																		<span>{speed}x</span>
																		{clockSnap.playSpeed === speed && (
																			<CheckIcon className="size-4 text-ink-200" />
																		)}
																	</MenuItem>
																))}
															</MenuPopup>
														</MenuPositioner>
													</MenuPortal>
												</MenuSubRoot>

												<MenuSeparator />

												{/* subtitle text size */}
												<MenuSubRoot>
													<MenuSubTrigger
														label="Subtitle size"
														className="justify-between"
													>
														<span>Subtitle size</span>
													</MenuSubTrigger>
													<MenuPortal>
														<MenuPositioner side="right" align="start">
															<MenuPopup>
																{[
																	'Small',
																	'Medium',
																	'Large',
																	'Extra large',
																].map((label, i) => (
																	<MenuItem
																		key={label}
																		onClick={() => setTextSize(TEXT_SIZES[i])}
																		className="justify-between"
																	>
																		<span>{label}</span>
																		{getTextSize() === TEXT_SIZES[i] && (
																			<CheckIcon className="size-4 text-ink-200" />
																		)}
																	</MenuItem>
																))}
															</MenuPopup>
														</MenuPositioner>
													</MenuPortal>
												</MenuSubRoot>
											</MenuPopup>
										</MenuPositioner>
									</MenuPortal>
								</MenuRoot>
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</>
	)
}
