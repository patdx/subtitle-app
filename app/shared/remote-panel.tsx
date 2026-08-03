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
import { filesQueryOptions } from './file-queries'
import { TransportCluster } from './transport'
import { Timeline } from './timeline'
import { Subtitle } from './subtitle'
import PhArrowUUpLeft from '~icons/ph/arrow-u-up-left'
import PhCheck from '~icons/ph/check'
import PhFileText from '~icons/ph/file-text'
import PhGearSix from '~icons/ph/gear-six'
import PhWaveform from '~icons/ph/waveform'
import {
	clock,
	controlState,
	getActiveNodes,
	toggleTranscript,
	uiState,
} from './utils'

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

/**
 * Full-screen controller UI for every non-active device in a group:
 * synced subtitle cues (for seeking context), transport, "now playing on
 * [device]", and a file picker that casts to the active player.
 */
export const RemotePanel = () => {
	const navigate = useNavigate()
	const syncSnap = useSnapshot(syncState)
	const clockSnap = useSnapshot(clock)
	const controlSnap = useSnapshot(controlState)
	const uiSnap = useSnapshot(uiState)
	const [pickerOpen, setPickerOpen] = useState(false)
	const filesQuery = useQuery(filesQueryOptions)

	const playerName = activePlayerName(syncSnap)
	const playerOnline = activePlayerOnline(syncSnap)
	const nowPlaying = syncSnap.nowPlayingFile
	const files = filesQuery.data ?? []

	const loadedMatchesNowPlaying =
		!!nowPlaying?.fileId && uiSnap.file?.[0]?.fileId === nowPlaying.fileId
	const showCues = loadedMatchesNowPlaying && !controlSnap.showTranscript

	const pickFile = (fileId: string) => {
		setPickerOpen(false)
		navigate(`/play?id=${fileId}`)
	}

	return (
		<div className="absolute inset-0 z-10 flex flex-col bg-black px-4 pb-safe-or-6 text-white">
			{/* header (below the persistent sync pill) */}
			<div className="flex items-start justify-between gap-3 pt-safe-or-12">
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
				<div className="flex flex-none items-center gap-1">
					<button
						type="button"
						onClick={toggleTranscript}
						aria-label="Toggle transcript"
						disabled={!loadedMatchesNowPlaying}
						className="flex h-11 w-11 items-center justify-center rounded-control text-ink-300 transition-colors hover:text-white active:text-white disabled:opacity-40"
					>
						<PhFileText />
					</button>
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
			</div>

			{/* live cues — same clock as the active player, for seek context */}
			<div className="flex min-h-0 flex-1 flex-col justify-center px-2 py-4 text-center">
				{showCues ? (
					getActiveNodes(uiSnap.file, clockSnap.actualTimeElapsedMs).map(
						(node) => <Subtitle key={node.id} node={node} />,
					)
				) : nowPlaying && !loadedMatchesNowPlaying ? (
					<p className="text-sm text-ink-500">Loading subtitles…</p>
				) : null}
			</div>

			{/* transport */}
			<div className="mx-auto flex w-full max-w-xl flex-none flex-col gap-6">
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
					<div className="flex flex-col overflow-y-auto px-4 pb-safe-or-6">
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
