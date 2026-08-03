import { useQuery, useQueryClient } from '@tanstack/react-query'
import { once } from 'lodash-es'
import { Link as RouterLink } from 'react-router'
import { useSnapshot } from 'valtio'
import { Block, Navbar, Page } from '~/components'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Progress } from '~/components/ui/progress'
import { Badge } from '~/components/ui/badge'
import {
	MenuItem,
	MenuPopup,
	MenuPortal,
	MenuPositioner,
	MenuRoot,
	MenuTrigger,
} from '~/components/ui/menu'
import PhCaretRight from '~icons/ph/caret-right'
import PhCheck from '~icons/ph/check'
import PhCircleNotch from '~icons/ph/circle-notch'
import PhDotsThree from '~icons/ph/dots-three'
import PhWaveform from '~icons/ph/waveform'
import { buttonChrome } from '~/shared/utils'
import sampleSrtUrl from '../assets/sample.srt?url'
import { DevicesMenu } from '~/shared/device-picker'
import {
	filesQueryKey,
	filesQueryOptions,
	type FileRecord,
} from '~/shared/file-queries'
import {
	syncState,
	syncStore,
	activePlayerName,
	activePlayerOnline,
	type SyncSnapshot,
} from '~/shared/sync'
import type { Route } from './+types/_index'

const parseVideoPromise = once(() =>
	import('video-name-parser').then((mod) => mod.default),
)

/**
 * Import every .srt entry inside a zip archive. Lives at module scope:
 * React Compiler does not lower dynamic import() or try/finally inside
 * component-scope functions, so the zip handling stays here.
 */
async function importZipArchive(file: File) {
	const zip = await import('@zip.js/zip.js')
	const reader = new zip.ZipReader(new zip.BlobReader(file))
	try {
		const entries = await reader.getEntries()
		for (const entry of entries) {
			if (/.srt$/i.test(entry.filename) && 'getData' in entry) {
				try {
					const text = await entry.getData(new zip.TextWriter())
					await addFileToDatabase(text, entry.filename)
				} catch (err) {
					console.log(
						`The following error occurred while processing ${entry.filename}`,
					)
					console.error(err)
				}
			}
		}
	} finally {
		await reader.close()
	}
}

export function meta({}: Route.MetaArgs) {
	return [{ title: 'Subtitle App' }]
}

export default function Home() {
	return (
		<Page>
			<Navbar title="Subtitle App" />
			<EditFilesPage />
		</Page>
	)
}

/** Most recently played first, then alphabetically. Lives at module scope so
 * React Compiler does not need to lower the logical expressions inside. */
const compareByLastPlayed = (a: FileRecord, b: FileRecord): number => {
	const byTime = (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0)
	return byTime || a.name.localeCompare(b.name)
}

/** Hash is the only cross-device file identity — no fileId fallback. */
const matchesNowPlayingHash = (
	file: FileRecord,
	nowPlayingHash: string | null | undefined,
): boolean => !!nowPlayingHash && file.hash === nowPlayingHash

/** One-line status for the group card on the home page. */
const playerStatus = (snap: SyncSnapshot): string => {
	if (snap.nowPlayingFile) {
		const name = activePlayerName(snap)
		if (name && activePlayerOnline(snap)) return `Now playing on ${name}`
		return 'Player offline'
	}
	return 'Group ready'
}

const PlayOnThisDeviceButton = () => (
	<DevicesMenu>
		<button
			type="button"
			className="flex flex-none items-center gap-1.5 rounded-control bg-ember-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-ember-700 active:bg-ember-700"
			onClick={(e) => {
				e.preventDefault()
				e.stopPropagation()
			}}
		>
			<PhWaveform className="!size-4" />
			Play on this device
		</button>
	</DevicesMenu>
)

const EditFilesPage = () => {
	const id = useId()
	const queryClient = useQueryClient()
	const [isProcessing, setProcessing] = useState(false)
	const [renamingId, setRenamingId] = useState<string | null>(null)
	const [renameValue, setRenameValue] = useState('')
	const syncSnap = useSnapshot(syncState)

	const result = useQuery(filesQueryOptions)

	const data = () => result.data

	const invalidateFiles = () =>
		queryClient.invalidateQueries({ queryKey: filesQueryKey })

	const handleFile = async (file: File) => {
		// Check for supported file types
		const isSupported =
			/.srt$/i.test(file.name) ||
			/.zip$/i.test(file.name) ||
			file.type === 'application/zip' ||
			file.type === 'text/plain' || // Allow plain text as it might be SRT
			file.type === 'text/srt' ||
			file.type === 'application/x-subrip'

		if (!isSupported) {
			alert(
				`Unsupported file type: ${file.type}. Please select an SRT or ZIP file.`,
			)
			return
		}

		setProcessing(true)
		const isZip = /.zip$/i.test(file.name) || file.type === 'application/zip'
		try {
			if (isZip) {
				await importZipArchive(file)
			} else {
				await addFileToDatabase(await file.text(), file.name)
			}
			void invalidateFiles()
			await syncStore.onFilesChanged()
		} catch (err) {
			setProcessing(false)
			throw err
		}
		setProcessing(false)
	}

	const inputRef = useRef<HTMLInputElement>(null)

	const parseVideo = use(parseVideoPromise())

	const isEmpty = () => !data() || data()!.length === 0

	const hasHistory = (file: FileRecord) =>
		typeof file.progress === 'number' && file.progress > 0

	const nowPlayingHash = syncSnap.nowPlayingFile?.hash

	/** Now-playing (by hash) pinned first, then most recently played, then alpha. */
	const files = () =>
		(data() ?? []).slice().sort((a, b) => {
			const aPlaying = matchesNowPlayingHash(a, nowPlayingHash)
			const bPlaying = matchesNowPlayingHash(b, nowPlayingHash)
			if (aPlaying !== bPlaying) return aPlaying ? -1 : 1
			return compareByLastPlayed(a, b)
		})

	const hasLocalNowPlaying = () =>
		!!nowPlayingHash &&
		(data() ?? []).some((file) => matchesNowPlayingHash(file, nowPlayingHash))

	const showSyntheticNowPlaying =
		syncSnap.role === 'peer' &&
		!!syncSnap.nowPlayingFile &&
		!hasLocalNowPlaying()

	const showFileList = !isEmpty() || showSyntheticNowPlaying

	const progressPercent = (file: FileRecord) => {
		const duration = file.length ?? 0
		const progress = file.progress ?? 0
		if (!duration || duration <= 0) return 0
		return Math.min(100, Math.round((progress / duration) * 100))
	}

	const formatTime = (ms: number) => {
		const totalSeconds = Math.floor(ms / 1000)
		const minutes = Math.floor(totalSeconds / 60)
		const seconds = totalSeconds % 60
		return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
	}

	/** Delete a file and its subtitle lines. */
	const deleteFile = async (file: FileRecord) => {
		const db = await initAndGetDb()
		const tx = db.transaction(['files', 'lines'], 'readwrite')
		tx.objectStore('files').delete(file.id)
		const keys = await tx
			.objectStore('lines')
			.index('by-file-id')
			.getAllKeys(file.id)
		for (const key of keys) {
			tx.objectStore('lines').delete(key)
		}
		await tx.done
		void invalidateFiles()
		syncStore.sendFileDeleted(file.id, file.name)
	}

	/** Clear saved playback progress for a file. */
	const clearProgress = async (file: FileRecord) => {
		const db = await initAndGetDb()
		await db.put('files', { ...file, progress: 0, lastPlayed: 0 })
		void invalidateFiles()
	}

	/** Rename a file. */
	const renameFile = async (file: FileRecord, newName: string) => {
		const trimmed = newName.trim()
		if (!trimmed || trimmed === file.name) {
			setRenamingId(null)
			return
		}
		const db = await initAndGetDb()
		await db.put('files', { ...file, name: trimmed })
		setRenamingId(null)
		void invalidateFiles()
	}

	const ProgressBar = ({
		percent,
		className,
	}: {
		percent: number
		className?: string
	}) => {
		return (
			<Progress
				value={percent}
				indicatorClassName="bg-ember-500"
				className={cn('w-full', className)}
			/>
		)
	}

	return (
		<>
			<Block className="px-4 pb-2">
				<p className="max-w-prose text-sm text-ink-500">
					Your subtitle library
				</p>
			</Block>

			{/* Import is subordinate to the library — one line, not a hero */}
			<Block className="px-4">
				<input
					ref={inputRef}
					id={`${id}-file-upload`}
					className="hidden"
					type="file"
					onChange={async (event) => {
						const target = event.target as HTMLInputElement
						const file = target.files?.[0]
						target.value = ''
						if (!file) return
						await handleFile(file)
					}}
				/>

				<div className="flex flex-wrap items-center gap-2">
					<Button
						onClick={() => inputRef.current?.click()}
						className={buttonChrome}
					>
						Import SRT or ZIP
						{isProcessing && <PhCircleNotch className="!size-5 animate-spin" />}
					</Button>

					<Button
						variant="secondary"
						onClick={async () => {
							const blob = await fetch(sampleSrtUrl).then((result) =>
								result.blob(),
							)
							const file = new File([blob], 'sample.srt')
							await handleFile(file)
						}}
						className={cn(buttonChrome, 'border-ink-400')}
					>
						Try with sample file
					</Button>
				</div>
			</Block>

			{/* Empty state teaches the space. */}
			{isEmpty() && !showSyntheticNowPlaying && (
				<Block className="px-4 pt-8">
					<p className="text-base font-medium text-ink-900">
						No subtitle files yet
					</p>
					<p className="mt-1 max-w-prose text-sm text-ink-500">
						Import an SRT or ZIP to get started, or load the sample file above
						to see the player.
					</p>
				</Block>
			)}

			{/* Now-playing pinned first (by hash); remote-only file as synthetic card */}
			{showFileList && (
				<div className="flex flex-col gap-3 px-4 pt-6">
					{showSyntheticNowPlaying && (
						<div className="rounded-panel border border-ink-400 bg-paper-raised p-4">
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0 flex-1">
									<p className="text-xs text-ink-400">
										{playerStatus(syncSnap)}
									</p>
									<p className="mt-0.5 truncate font-medium text-ink-900">
										{syncSnap.nowPlayingFile?.name}
									</p>
								</div>
								<PlayOnThisDeviceButton />
							</div>
						</div>
					)}
					{files().map((file) => {
						const percent = progressPercent(file)
						const showHistory = hasHistory(file)
						const isNowPlaying = matchesNowPlayingHash(file, nowPlayingHash)
						return (
							<RouterLink
								key={file.id}
								to={`/play?id=${file.id}`}
								className={cn(
									'block rounded-panel border bg-paper-raised p-4 hover:border-ink-400',
									isNowPlaying ? 'border-ink-400' : 'border-edge',
								)}
							>
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0 flex-1">
										{isNowPlaying && (
											<p className="text-xs text-ink-400">
												{playerStatus(syncSnap)}
											</p>
										)}
										{renamingId === file.id ? (
											<div className="flex items-center gap-2">
												<Input
													autoFocus
													value={renameValue}
													onChange={(e) => setRenameValue(e.target.value)}
													onKeyDown={(e) => {
														if (e.key === 'Enter') {
															void renameFile(file, renameValue)
														} else if (e.key === 'Escape') {
															setRenamingId(null)
														}
													}}
													className="rounded-field border-ink-400 bg-paper px-3 py-1.5 text-sm text-ink-900"
												/>
												<button
													type="button"
													aria-label="Save rename"
													className="flex h-9 w-9 flex-none items-center justify-center rounded-control text-ok hover:bg-ok-soft"
													onClick={(e) => {
														e.preventDefault()
														void renameFile(file, renameValue)
													}}
												>
													<PhCheck />
												</button>
												<button
													type="button"
													aria-label="Cancel rename"
													className="flex h-9 w-9 flex-none items-center justify-center rounded-control text-ink-400 hover:bg-ink-50 hover:text-ink-900"
													onClick={(e) => {
														e.preventDefault()
														setRenamingId(null)
													}}
												>
													<PhDotsThree className="rotate-90" />
												</button>
											</div>
										) : (
											<p
												className={cn(
													'truncate font-medium text-ink-900',
													isNowPlaying && 'mt-0.5',
												)}
											>
												{file.name}
											</p>
										)}
										{showHistory && (
											<p className="mt-1 text-xs text-ink-500">
												{percent}% · Resume at {formatTime(file.progress ?? 0)}
											</p>
										)}
										{!showHistory && metadataChips(file, parseVideo)}
									</div>
									<div
										className="flex flex-none items-center gap-1"
										onClick={(e) => e.stopPropagation()}
									>
										{isNowPlaying && <PlayOnThisDeviceButton />}
										<MenuRoot>
											<MenuTrigger
												render={
													<button
														type="button"
														aria-label="File actions"
														className="flex h-10 w-10 items-center justify-center rounded-control text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-900"
														onClick={(e) => {
															e.preventDefault()
															e.stopPropagation()
														}}
													/>
												}
											>
												<PhDotsThree />
											</MenuTrigger>
											<MenuPortal>
												<MenuPositioner>
													<MenuPopup>
														<MenuItem
															onClick={() => {
																void clearProgress(file)
															}}
														>
															Clear watch progress
														</MenuItem>
														<MenuItem
															onClick={() => {
																setRenameValue(file.name)
																setRenamingId(file.id)
															}}
														>
															Rename
														</MenuItem>
														<MenuItem
															className="text-destructive focus:text-destructive"
															onClick={() => {
																void deleteFile(file)
															}}
														>
															Delete
														</MenuItem>
													</MenuPopup>
												</MenuPositioner>
											</MenuPortal>
										</MenuRoot>
									</div>
								</div>
								{showHistory && (
									<div className="mt-3">
										<ProgressBar percent={percent} />
									</div>
								)}
							</RouterLink>
						)
					})}
				</div>
			)}

			{(syncSnap.role !== 'peer' || !syncSnap.nowPlayingFile) && (
				<Block className="px-4 pt-4">
					{syncSnap.role === 'peer' ? (
						<div className="flex items-center justify-between gap-3 rounded-panel border border-ink-400 bg-paper-raised px-4 py-3">
							<div className="min-w-0">
								<p className="text-xs text-ink-400">{playerStatus(syncSnap)}</p>
								<p className="truncate text-sm font-medium text-ink-900">
									Not playing — pick a device, then choose a file
								</p>
							</div>
							<PlayOnThisDeviceButton />
						</div>
					) : (
						<RouterLink
							to="/sync"
							className="flex items-center justify-between rounded-panel border border-ink-400 bg-paper-raised px-4 py-3 text-sm font-medium text-ink-900 hover:border-ink-600 hover:bg-ink-50"
						>
							Sync with another device
							<PhCaretRight className="text-ink-400" />
						</RouterLink>
					)}
				</Block>
			)}

			<Block className="px-4 mt-4 text-center">
				<RouterLink
					to="/about"
					className="text-sm text-ember-600 hover:text-ember-700"
				>
					About this app
				</RouterLink>
			</Block>
		</>
	)
}

interface VideoMetadata {
	season?: number | string
	episode?: (number | string)[]
}

function metadataChips(
	file: FileRecord,
	parseVideo: (name: string) => VideoMetadata | undefined,
) {
	let metadata: VideoMetadata | undefined
	try {
		metadata = parseVideo(file.name)
	} catch (err) {
		console.warn(err)
	}
	return (
		<div className="flex gap-2">
			{metadata?.season && (
				<Badge variant="ghost" className="h-auto px-0 py-0 text-ink-400">
					Season {metadata.season}
				</Badge>
			)}
			{metadata?.episode?.map((item) => (
				<Badge
					key={item}
					variant="ghost"
					className="h-auto px-0 py-0 text-ink-400"
				>
					Episode {item}
				</Badge>
			))}
		</div>
	)
}
