import { useSnapshot } from 'valtio'
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '~/components/ui/tooltip'
import { seekBy, togglePlayback } from './sync'
import { clock } from './utils'
import { LeftIcon, PauseIcon, PlayIcon, RightIcon } from './icons'

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
		<Tooltip>
			<TooltipTrigger
				render={
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
				}
			/>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	)
}

const SEEK_BACK = [
	{ ms: -10000, text: '10s', label: 'Back 10 seconds' },
	{ ms: -5000, text: '5s', label: 'Back 5 seconds' },
	{ ms: -1000, text: '1s', label: 'Back 1 second' },
] as const

const SEEK_FORWARD = [
	{ ms: 1000, text: '1s', label: 'Forward 1 second' },
	{ ms: 5000, text: '5s', label: 'Forward 5 seconds' },
	{ ms: 10000, text: '10s', label: 'Forward 10 seconds' },
] as const

/** The shared seek/play transport cluster (player controls + remote panel). */
export const TransportCluster = () => {
	const clockSnap = useSnapshot(clock)
	return (
		<div className="flex items-center justify-center">
			{SEEK_BACK.map((step) => (
				<IconTextButton
					key={step.ms}
					icon={<LeftIcon />}
					text={step.text}
					label={step.label}
					onClick={() => seekBy(step.ms)}
				/>
			))}

			<button
				type="button"
				className="mx-1 flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 active:bg-white/25"
				onClick={togglePlayback}
				aria-label={clockSnap.isPlaying ? 'Pause' : 'Play'}
			>
				{clockSnap.isPlaying ? <PauseIcon /> : <PlayIcon />}
			</button>

			{SEEK_FORWARD.map((step) => (
				<IconTextButton
					key={step.ms}
					icon={<RightIcon />}
					text={step.text}
					label={step.label}
					onClick={() => seekBy(step.ms)}
				/>
			))}
		</div>
	)
}
