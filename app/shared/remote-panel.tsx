import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { useSnapshot } from 'valtio'
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from '~/components/ui/sheet'
import {
	MenuItem,
	MenuPopup,
	MenuPortal,
	MenuPositioner,
	MenuRoot,
	MenuTrigger,
} from '~/components/ui/menu'
import {
	activePlayerName,
	activePlayerOnline,
	setPlaySpeed,
	syncState,
} from './sync'
import { DevicesMenu } from './device-picker'
import { TransportCluster } from './transport'
import { Timeline } from './timeline'
import PhArrowUUpLeft from '~icons/ph/arrow-u-up-left'
import PhCheck from '~icons/ph/check'
import PhGearSix from '~icons/ph/gear-six'
import PhWaveform from '~icons/ph/waveform'
import { clock, initAndGetDb } from './utils'

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

/**
 * Full-screen controller UI for every non-active device in a group:
 * no subtitle text, just transport, "now playing on [device]" and a file
 * picker that casts to the active player.
 */
export const RemotePanel = () => {
	const navigate = useNavigate()
	const syncSnap = useSnapshot(syncState)
	const clockSnap = useSnapshot(clock)
	const [pickerOpen, setPickerOpen] = useState(false)
	const filesQuery = useQuery({
		queryKey: ['files'],
		queryFn: () => initAndGetDb().then((db) => db.getAll('files')),
	})

	const playerName = activePlayerName(syncSnap)
	const playerOnline = activePlayerOnline(syncSnap)
	const nowPlaying = syncSnap.nowPlayingFile
	const files = filesQuery.data ?? []

	const pickFile = (fileId: string) => {
		setPickerOpen(false)
		navigate(`/play?id=${fileId}`)
	}

	return (
		<div className="absolute inset-0 z-10 flex flex-col bg-black px-4 pb-6 text-white">
			{/* header (below the persistent sync pill) */}
			<div className="flex items-start justify-between gap-3 pt-12">
				<div className="flex min-w-0 items-start gap-3">
					<Link
						to="/"
						aria-label="Back to file list"
						className="flex h-11 w-11 flex-none items-center justify-center rounded-control text-ink-300 transition-colors duration-150 hover:text-white active:text-white"
					>
						<PhArrowUUpLeft />
					</Link>
					<div className="min-w-0">
						<p className="text-xs uppercase tracking-widest text-ink-400">
							Now playing
						</p>
						<p className="truncate text-lg font-semibold">
							{nowPlaying?.name ?? 'No file selected'}
						</p>
						<p className="text-sm text-ink-400">
							{nowPlaying && playerOnline && playerName
								? `on ${playerName}`
								: nowPlaying && !playerOnline
									? 'Player offline'
									: 'Pick a device or a file to start'}
						</p>
					</div>
				</div>
				<DevicesMenu>
					<button
						type="button"
						aria-label="Play on this device"
						className="flex h-11 w-11 flex-none items-center justify-center rounded-control text-ink-300 transition-colors hover:text-white active:text-white"
					>
						<PhWaveform />
					</button>
				</DevicesMenu>
			</div>

			{/* transport */}
			<div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6">
				<Timeline />

				<TransportCluster />

				<div className="flex items-center justify-center gap-4">
					<button
						type="button"
						onClick={() => {
							void filesQuery.refetch()
							setPickerOpen(true)
						}}
						className="rounded-control border border-ink-700 px-4 py-2 text-sm font-medium text-ink-200 transition-colors hover:border-ink-500 hover:text-white"
					>
						Play another file
					</button>

					<MenuRoot>
						<MenuTrigger
							render={
								<button
									type="button"
									aria-label="Playback speed"
									className="flex h-11 w-11 items-center justify-center rounded-control text-ink-300 transition-colors hover:text-white active:text-white"
								>
									<PhGearSix />
								</button>
							}
						/>
						<MenuPortal>
							<MenuPositioner side="top" align="center">
								<MenuPopup>
									{SPEEDS.map((speed) => (
										<MenuItem
											key={speed}
											onClick={() => setPlaySpeed(speed)}
											className="justify-between"
										>
											<span>{speed}x</span>
											{clockSnap.playSpeed === speed && (
												<PhCheck className="!size-4 text-ink-200" />
											)}
										</MenuItem>
									))}
								</MenuPopup>
							</MenuPositioner>
						</MenuPortal>
					</MenuRoot>
				</div>
			</div>

			{/* file picker */}
			<Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
				<SheetContent side="bottom" className="max-h-[70vh]">
					<SheetHeader>
						<SheetTitle>Play another file</SheetTitle>
					</SheetHeader>
					<div className="flex flex-col overflow-y-auto px-4 pb-6">
						{files.length === 0 && (
							<p className="px-1 text-sm text-muted-foreground">
								No files yet — import an SRT from the library.
							</p>
						)}
						{files.map((file) => {
							const isCurrent = nowPlaying?.hash === file.hash
							return (
								<button
									key={file.id}
									type="button"
									onClick={() => pickFile(file.id)}
									className="flex items-center justify-between gap-3 border-b border-border px-1 py-3 text-left text-sm text-foreground transition-colors hover:bg-muted"
								>
									<span className="truncate">{file.name}</span>
									{isCurrent && (
										<PhCheck className="!size-4 flex-none text-ink-200" />
									)}
								</button>
							)
						})}
					</div>
				</SheetContent>
			</Sheet>
		</div>
	)
}
