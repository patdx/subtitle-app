import { useQuery, useQueryClient } from '@tanstack/react-query'
import { once } from 'lodash-es'
import { Link as RouterLink } from 'react-router'
import { useSnapshot } from 'valtio'
import { Page } from '~/components'
import { Input } from '~/components/ui/input'
import { Badge } from '~/components/ui/badge'
import {
	MenuItem,
	MenuPopup,
	MenuPortal,
	MenuPositioner,
	MenuRoot,
	MenuTrigger,
} from '~/components/ui/menu'
import PhCheck from '~icons/ph/check'
import PhCircleNotch from '~icons/ph/circle-notch'
import PhDeviceMobile from '~icons/ph/device-mobile'
import PhDotsThree from '~icons/ph/dots-three'
import PhFileAudio from '~icons/ph/file-audio'
import PhPlus from '~icons/ph/plus'
import PhWaveform from '~icons/ph/waveform'
import PhBroadcast from '~icons/ph/broadcast'
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
		<Page className="bg-stage text-stage-fg">
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

/** Thin strip copy for the Spotify-style now-playing chrome. */
const playingOnLabel = (snap: SyncSnapshot): string => {
	if (snap.nowPlayingFile) {
		const name = activePlayerName(snap)
		if (name && activePlayerOnline(snap)) return `Playing on ${name}`
		return 'Player offline'
	}
	return 'Not playing'
}

/** Deterministic warm cover art from a title/hash seed (no purple drift). */
const posterCoverStyle = (seed: string): React.CSSProperties => {
	let hash = 2166136261
	for (let i = 0; i < seed.length; i++) {
		hash ^= seed.charCodeAt(i)
		hash = Math.imul(hash, 16777619)
	}
	const warmHue = 18 + (hash % 48)
	const warmHue2 = 28 + ((hash >>> 8) % 36)
	const light = 28 + ((hash >>> 16) % 14)
	const light2 = 18 + ((hash >>> 20) % 12)
	return {
		backgroundImage: `
			radial-gradient(ellipse 80% 60% at 20% 15%, oklch(0.55 0.12 ${warmHue} / 0.55), transparent 55%),
			radial-gradient(ellipse 70% 50% at 85% 80%, oklch(0.4 0.1 ${warmHue2} / 0.5), transparent 50%),
			linear-gradient(160deg, oklch(${light / 100} 0.04 ${warmHue}), oklch(${light2 / 100} 0.06 ${warmHue2}))
		`,
	}
}

const posterInitials = (name: string): string => {
	const base = name.replace(/\.srt$/i, '').trim()
	const parts = base.split(/[\s._-]+/).filter(Boolean)
	if (parts.length >= 2) {
		return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
	}
	return base.slice(0, 2).toUpperCase() || 'SR'
}

const NowPlayingBar = ({ snap }: { snap: SyncSnapshot }) => {
	const title = snap.nowPlayingFile?.name ?? 'Nothing playing'
	const strip = playingOnLabel(snap)
	const hasTitle = !!snap.nowPlayingFile

	return (
		<div className="stage-now-playing-bar pointer-events-auto overflow-hidden rounded-t-panel border border-stage-edge border-b-0 bg-stage-raised shadow-[0_-8px_32px_oklch(0_0_0/0.35)]">
			<div className="bg-ember-600 px-3 py-1 text-center text-[11px] font-medium tracking-wide text-white">
				{strip}
			</div>
			<div className="flex items-center gap-3 px-3 py-2.5">
				<div
					className="flex h-11 w-11 flex-none items-center justify-center rounded-control text-sm font-semibold text-stage-fg/90"
					style={posterCoverStyle(hasTitle ? title : 'idle')}
					aria-hidden
				>
					{hasTitle ? posterInitials(title) : <PhWaveform className="!size-5" />}
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-medium text-stage-fg">
						{hasTitle ? title : 'Pick a title to start'}
					</p>
					<p className="truncate text-xs text-stage-muted">
						{hasTitle
							? 'Switch playback device anytime'
							: 'Choose a device, then open a file'}
					</p>
				</div>
				<DevicesMenu>
					<button
						type="button"
						aria-label="Choose playback device"
						className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-stage-edge text-stage-fg transition-colors hover:border-ember-500 hover:text-ember-500"
						onClick={(e) => {
							e.preventDefault()
							e.stopPropagation()
						}}
					>
						<PhDeviceMobile className="!size-5" />
					</button>
				</DevicesMenu>
			</div>
		</div>
	)
}

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
		const isSupported =
			/.srt$/i.test(file.name) ||
			/.zip$/i.test(file.name) ||
			file.type === 'application/zip' ||
			file.type === 'text/plain' ||
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

	const showPeerBar = syncSnap.role === 'peer'
	const contentPad = showPeerBar ? 'pb-safe-or-28' : 'pb-safe-or-10'
	/** When the shelf has titles, actions collapse to a toolbar so posters lead. */
	const hasShelfContent = !isEmpty() || showSyntheticNowPlaying
	const showEmptyActionPosters = !hasShelfContent

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

	const clearProgress = async (file: FileRecord) => {
		const db = await initAndGetDb()
		await db.put('files', { ...file, progress: 0, lastPlayed: 0 })
		void invalidateFiles()
	}

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

	const loadSample = async () => {
		const blob = await fetch(sampleSrtUrl).then((result) => result.blob())
		const file = new File([blob], 'sample.srt')
		await handleFile(file)
	}

	return (
		<>
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

			<div
				className={cn(
					'relative min-h-full bg-stage px-4 pt-safe-or-8',
					contentPad,
					// Atmospheric wash behind the brand — not flat black.
					'bg-[radial-gradient(ellipse_90%_55%_at_10%_-10%,oklch(0.32_0.08_35/0.55),transparent_55%),radial-gradient(ellipse_70%_45%_at_95%_5%,oklch(0.28_0.06_45/0.35),transparent_50%),var(--color-stage)]',
				)}
			>
				<header className={cn('relative', hasShelfContent ? 'mb-4' : 'mb-8')}>
					<div className="flex items-start justify-between gap-4">
						<div className="min-w-0">
							<p className="text-xs font-medium tracking-[0.18em] text-ember-500 uppercase">
								Your library
							</p>
							<h1
								className={cn(
									'font-display mt-1 font-extrabold tracking-tight text-stage-fg',
									hasShelfContent
										? 'text-2xl sm:text-3xl'
										: 'text-4xl sm:text-5xl',
								)}
							>
								Subtitle App
							</h1>
							{!hasShelfContent && (
								<p className="mt-2 max-w-md text-sm text-stage-muted">
									Import subtitles, pick up where you left off, sync playback
									across your devices.
								</p>
							)}
						</div>
						<RouterLink
							to="/about"
							className="shrink-0 pt-1 text-sm text-stage-muted transition-colors hover:text-ember-500"
						>
							About
						</RouterLink>
					</div>
				</header>

				{hasShelfContent && (
					<div className="mb-4 flex flex-wrap items-center gap-2">
						<button
							type="button"
							onClick={() => inputRef.current?.click()}
							disabled={isProcessing}
							className={cn(
								'inline-flex items-center gap-1.5 rounded-control border border-stage-edge bg-stage-raised px-3 py-2 text-sm font-medium text-stage-fg transition-colors',
								'hover:border-ember-500/70 hover:text-ember-500',
								isProcessing && 'opacity-70',
							)}
						>
							{isProcessing ? (
								<PhCircleNotch className="!size-4 animate-spin" />
							) : (
								<PhPlus className="!size-4" />
							)}
							Import
						</button>
						<button
							type="button"
							onClick={() => {
								void loadSample()
							}}
							disabled={isProcessing}
							className={cn(
								'inline-flex items-center gap-1.5 rounded-control border border-stage-edge bg-stage-raised px-3 py-2 text-sm font-medium text-stage-fg transition-colors',
								'hover:border-ember-500/70 hover:text-ember-500',
								isProcessing && 'opacity-70',
							)}
						>
							<PhFileAudio className="!size-4" />
							Sample
						</button>
						{syncSnap.role !== 'peer' && (
							<RouterLink
								to="/sync"
								className="inline-flex items-center gap-1.5 rounded-control border border-stage-edge bg-stage-raised px-3 py-2 text-sm font-medium text-stage-fg transition-colors hover:border-ember-500/70 hover:text-ember-500"
							>
								<PhBroadcast className="!size-4" />
								Sync
							</RouterLink>
						)}
					</div>
				)}

				{showEmptyActionPosters && (
					<p className="mb-5 text-sm text-stage-muted">
						No files yet — use the import tile, or try the sample.
					</p>
				)}

				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
					{showEmptyActionPosters && (
						<>
							{/* Action: Import */}
							<button
								type="button"
								onClick={() => inputRef.current?.click()}
								disabled={isProcessing}
								className={cn(
									'stage-poster-lift group flex aspect-2/3 flex-col items-center justify-center gap-3 rounded-panel border border-dashed border-stage-edge bg-stage-raised/60 px-3 text-center transition-colors',
									'hover:border-ember-500/70 hover:bg-stage-elevated/80',
									isProcessing && 'opacity-70',
								)}
							>
								<span className="flex h-12 w-12 items-center justify-center rounded-full border border-stage-edge text-stage-fg transition-colors group-hover:border-ember-500 group-hover:text-ember-500">
									{isProcessing ? (
										<PhCircleNotch className="!size-6 animate-spin" />
									) : (
										<PhPlus className="!size-6" />
									)}
								</span>
								<span className="text-sm font-medium text-stage-fg">
									Import SRT or ZIP
								</span>
								<span className="text-xs text-stage-muted">
									Add to your shelf
								</span>
							</button>

							{/* Action: Sample */}
							<button
								type="button"
								onClick={() => {
									void loadSample()
								}}
								disabled={isProcessing}
								className={cn(
									'stage-poster-lift group flex aspect-2/3 flex-col items-center justify-center gap-3 rounded-panel border border-stage-edge bg-stage-raised/60 px-3 text-center transition-colors',
									'hover:border-ember-500/70 hover:bg-stage-elevated/80',
									isProcessing && 'opacity-70',
								)}
							>
								<span className="flex h-12 w-12 items-center justify-center rounded-full border border-stage-edge text-stage-fg transition-colors group-hover:border-ember-500 group-hover:text-ember-500">
									<PhFileAudio className="!size-6" />
								</span>
								<span className="text-sm font-medium text-stage-fg">
									Try sample file
								</span>
								<span className="text-xs text-stage-muted">
									See the player
								</span>
							</button>

							{/* Action: Sync (solo only) */}
							{syncSnap.role !== 'peer' && (
								<RouterLink
									to="/sync"
									className={cn(
										'stage-poster-lift group flex aspect-2/3 flex-col items-center justify-center gap-3 rounded-panel border border-stage-edge bg-stage-raised/60 px-3 text-center transition-colors',
										'hover:border-ember-500/70 hover:bg-stage-elevated/80',
									)}
								>
									<span className="flex h-12 w-12 items-center justify-center rounded-full border border-stage-edge text-stage-fg transition-colors group-hover:border-ember-500 group-hover:text-ember-500">
										<PhBroadcast className="!size-6" />
									</span>
									<span className="text-sm font-medium text-stage-fg">
										Sync devices
									</span>
									<span className="text-xs text-stage-muted">
										Play together nearby
									</span>
								</RouterLink>
							)}
						</>
					)}

					{/* Synthetic remote now-playing poster */}
					{showSyntheticNowPlaying && syncSnap.nowPlayingFile && (
						<div
							className={cn(
								'stage-poster-now-playing relative flex aspect-2/3 flex-col overflow-hidden rounded-panel ring-2 ring-ember-500',
							)}
						>
							<div
								className="relative min-h-0 flex-1"
								style={posterCoverStyle(syncSnap.nowPlayingFile.name)}
							>
								<div className="absolute inset-0 flex items-center justify-center">
									<span className="font-display text-3xl font-bold text-white/85 drop-shadow-md">
										{posterInitials(syncSnap.nowPlayingFile.name)}
									</span>
								</div>
								<div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent px-2.5 pb-2.5 pt-8">
									<p className="text-[10px] font-medium tracking-wide text-ember-500 uppercase">
										Now playing
									</p>
									<p className="truncate text-sm font-medium text-white">
										{syncSnap.nowPlayingFile.name}
									</p>
								</div>
							</div>
						</div>
					)}

					{/* File posters */}
					{files().map((file) => {
						const percent = progressPercent(file)
						const showHistory = hasHistory(file)
						const isNowPlaying = matchesNowPlayingHash(file, nowPlayingHash)
						const seed = file.hash ?? file.name

						return (
							<div
								key={file.id}
								className={cn(
									'relative flex aspect-2/3 flex-col overflow-hidden rounded-panel transition-[filter] duration-200',
									'hover:brightness-110',
									isNowPlaying &&
										'stage-poster-now-playing ring-2 ring-ember-500',
								)}
							>
								{renamingId === file.id ? (
									<div className="flex h-full flex-col gap-2 bg-stage-raised p-3">
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
											className="rounded-field border-stage-edge bg-stage px-3 py-1.5 text-sm text-stage-fg"
										/>
										<div className="flex gap-2">
											<button
												type="button"
												aria-label="Save rename"
												className="flex h-9 w-9 items-center justify-center rounded-control text-ok hover:bg-ok/15"
												onClick={() => {
													void renameFile(file, renameValue)
												}}
											>
												<PhCheck />
											</button>
											<button
												type="button"
												aria-label="Cancel rename"
												className="flex h-9 w-9 items-center justify-center rounded-control text-stage-muted hover:bg-stage-elevated hover:text-stage-fg"
												onClick={() => {
													setRenamingId(null)
												}}
											>
												<PhDotsThree className="rotate-90" />
											</button>
										</div>
									</div>
								) : (
									<>
										<RouterLink
											to={`/play?id=${file.id}`}
											className="relative min-h-0 flex-1 outline-offset-[-2px]"
											style={posterCoverStyle(seed)}
										>
											<div className="absolute inset-0 flex items-center justify-center">
												<span className="font-display text-3xl font-bold text-white/85 drop-shadow-md sm:text-4xl">
													{posterInitials(file.name)}
												</span>
											</div>

											{showHistory && (
												<div className="absolute inset-x-0 bottom-0 h-1 bg-black/45">
													<div
														className="stage-progress-fill h-full bg-ember-500"
														style={{ width: `${percent}%` }}
													/>
												</div>
											)}

											<div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/40 to-transparent px-2.5 pb-2.5 pt-10">
												{isNowPlaying && (
													<p className="text-[10px] font-medium tracking-wide text-ember-500 uppercase">
														Now playing
													</p>
												)}
												<p className="line-clamp-2 text-sm font-medium text-white">
													{file.name}
												</p>
												{showHistory ? (
													<p className="mt-0.5 text-[11px] text-white/65">
														{percent}% · {formatTime(file.progress ?? 0)}
													</p>
												) : (
													<div className="mt-0.5 [&_span]:text-white/55">
														{metadataChips(file, parseVideo)}
													</div>
												)}
											</div>
										</RouterLink>

										<div className="absolute top-1.5 right-1.5 z-10">
											<MenuRoot>
												<MenuTrigger
													render={
														<button
															type="button"
															aria-label="File actions"
															className="flex h-9 w-9 items-center justify-center rounded-control bg-black/45 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/65"
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
									</>
								)}
							</div>
						)
					})}
				</div>
			</div>

			{showPeerBar && (
				<div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-3 pb-safe">
					<div className="mx-auto max-w-lg">
						<NowPlayingBar snap={syncSnap} />
					</div>
				</div>
			)}
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
		<div className="flex flex-wrap gap-1.5">
			{metadata?.season && (
				<Badge variant="ghost" className="h-auto px-0 py-0 text-white/55">
					S{metadata.season}
				</Badge>
			)}
			{metadata?.episode?.map((item) => (
				<Badge
					key={item}
					variant="ghost"
					className="h-auto px-0 py-0 text-white/55"
				>
					E{item}
				</Badge>
			))}
		</div>
	)
}
