import { useSnapshot } from 'valtio'
import { AnimatePresence, motion } from 'motion/react'
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '~/components/ui/tooltip'
import PhCheck from '~icons/ph/check'
import PhCornersOut from '~icons/ph/corners-out'
import PhFileText from '~icons/ph/file-text'
import PhGearSix from '~icons/ph/gear-six'
import PhKeyboard from '~icons/ph/keyboard'
import { BackToLibraryLink } from '~/components'
import { PlayOnDeviceButton } from './device-picker'
import { setPlaySpeed, syncState } from './sync'
import { TransportCluster } from './transport'
import {
	clock,
	cn,
	controlState,
	getTextSize,
	iconButtonClass,
	PLAYBACK_SPEEDS,
	pokeControls,
	setTextSize,
	TEXT_SIZES,
	toggleFullscreen,
	toggleKeyboardHelp,
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

type SpeedMenuProps = {
	variant: 'submenu' | 'menu'
	playSpeed: number
	onSpeedChange: (speed: number) => void
	trigger: React.ReactNode
}

/** Playback-speed picker, shared by the player controls and the remote panel. */
export const SpeedMenu = ({
	variant,
	playSpeed,
	onSpeedChange,
	trigger,
}: SpeedMenuProps) => {
	const items = PLAYBACK_SPEEDS.map((speed) => (
		<MenuItem
			key={speed}
			onClick={() => onSpeedChange(speed)}
			className="justify-between"
		>
			<span>{speed}x</span>
			{playSpeed === speed && <PhCheck className="!size-4 text-ink-200" />}
		</MenuItem>
	))

	if (variant === 'submenu') {
		return (
			<MenuSubRoot>
				{trigger}
				<MenuPortal>
					<MenuPositioner side="right" align="start">
						<MenuPopup>{items}</MenuPopup>
					</MenuPositioner>
				</MenuPortal>
			</MenuSubRoot>
		)
	}
	return (
		<MenuRoot>
			{trigger}
			<MenuPortal>
				<MenuPositioner side="top" align="center">
					<MenuPopup>{items}</MenuPopup>
				</MenuPositioner>
			</MenuPortal>
		</MenuRoot>
	)
}

export const Controls = () => {
	const controlSnap = useSnapshot(controlState)
	const clockSnap = useSnapshot(clock)
	const syncSnap = useSnapshot(syncState)

	useEffect(() => {
		// Effects run after hydration, so the prerendered no-fullscreen state and
		// the first client render remain identical.
		controlState.fullScreenEnabled = document.fullscreenEnabled
	}, [])

	useEffect(() => {
		// Test/debug hook: ?keep-ui-open=1 disables the auto-fade so the
		// controls stay visible while iterating on the layout.
		const keepOpen =
			new URL(location.href).searchParams.get('keep-ui-open') === '1'
		if (keepOpen || controlSnap.faded) return
		const timer = window.setTimeout(() => {
			if (document.activeElement?.closest('[data-player-controls]')) return
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
						data-player-controls
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
								<TooltipTrigger render={<BackToLibraryLink />} />
								<TooltipContent>Back to file list</TooltipContent>
							</Tooltip>

							<div className="flex-1"></div>

							{/* play on this device (device picker) */}
							{syncSnap.role === 'peer' && <PlayOnDeviceButton />}

							{/* transcript button */}
							<Tooltip>
								<TooltipTrigger
									render={
										<button
											onClick={toggleTranscript}
											aria-label="Toggle transcript"
											className={iconButtonClass}
										>
											<PhFileText />
										</button>
									}
								/>
								<TooltipContent>Toggle transcript</TooltipContent>
							</Tooltip>

							<Tooltip>
								<TooltipTrigger
									render={
										<button
											onClick={toggleKeyboardHelp}
											aria-label="Keyboard shortcuts"
											className={iconButtonClass}
										>
											<PhKeyboard />
										</button>
									}
								/>
								<TooltipContent>Keyboard shortcuts</TooltipContent>
							</Tooltip>

							{controlSnap.fullScreenEnabled && (
								/* full screen button (for Android) */
								<Tooltip>
									<TooltipTrigger
										render={
											<button
												onClick={() => {
													void toggleFullscreen()
												}}
												aria-label="Toggle fullscreen"
												className={iconButtonClass}
											>
												<PhCornersOut />
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
						data-player-controls
						key="bottom-bar"
						initial={{ opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 12 }}
						transition={{ duration: 0.25 }}
						className="absolute bottom-0 left-0 right-0 z-10 bg-linear-to-t from-black to-transparent px-safe-or-6 pb-safe pt-16"
						onPointerDown={pokeControls}
					>
						{/* timeline: inset from screen edges for easier grabbing */}
						<div className="w-full px-2">
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
												className={cn(iconButtonClass, 'h-12 w-12')}
											>
												<PhGearSix />
											</button>
										}
									/>
									<MenuPortal>
										<MenuPositioner>
											<MenuPopup>
												{/* playback speed */}
												<SpeedMenu
													variant="submenu"
													playSpeed={clockSnap.playSpeed}
													onSpeedChange={setPlaySpeed}
													trigger={
														<MenuSubTrigger
															label="Playback speed"
															className="justify-between"
														>
															<span>Playback speed</span>
															<span className="text-ink-300">
																{clockSnap.playSpeed}x
															</span>
														</MenuSubTrigger>
													}
												/>

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
																			<PhCheck className="!size-4 text-ink-200" />
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
