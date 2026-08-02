import { useQuery } from '@tanstack/react-query'
import { once } from 'lodash-es'
import { Link as RouterLink } from 'react-router'
import { Block, Button, Navbar, Page } from '~/components'
import { CheckIcon, ChevronRightIcon, MoreIcon } from '~/shared/icons'
import { Menu, MenuAction } from '~/shared/menu'
import sampleSrtUrl from '../assets/sample.srt?url'
import { syncStore } from '~/shared/sync'
import type { Route } from './+types/_index'

const parseVideoPromise = once(() =>
	import('video-name-parser').then((mod) => mod.default),
)

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

interface FileRecord {
	id: string
	name: string
	length?: number
	watched?: boolean
	progress?: number
	lastPlayed?: number
}

const EditFilesPage = () => {
	const id = useId()
	const [isProcessing, setProcessing] = useSignal(false)
	const [renamingId, setRenamingId] = useSignal<string | null>(null)
	const [renameValue, setRenameValue] = useSignal('')

	const result = useQuery({
		queryKey: ['files'],
		queryFn: async () => {
			const db = await initAndGetDb()
			const files = (await db.getAll('files')) as FileRecord[]
			return files
		},
	})

	const data = () => result.data
	const handler = {
		refetch: result.refetch,
	}

	const handleFile = async (file: File) => {
		try {
			setProcessing(true)

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

			if (/.zip$/i.test(file.name) || file.type === 'application/zip') {
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
			} else {
				await addFileToDatabase(await file.text(), file.name)
			}
			handler.refetch()
			await syncStore.broadcastFileList()
		} finally {
			setProcessing(false)
		}
	}

	const inputRef = useRef<HTMLInputElement>(null)

	const parseVideo = use(parseVideoPromise())

	const isEmpty = () => !data() || data()!.length === 0

	const hasHistory = (file: FileRecord) =>
		typeof file.progress === 'number' && file.progress > 0

	/** One unified list: most recently played first, then alphabetically. */
	const files = () =>
		(data() ?? [])
			.slice()
			.sort(
				(a, b) =>
					(b.lastPlayed ?? 0) - (a.lastPlayed ?? 0) ||
					a.name.localeCompare(b.name),
			)

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
		handler.refetch()
		syncStore.sendFileDeleted(file.id, file.name)
	}

	/** Clear saved playback progress for a file. */
	const clearProgress = async (file: FileRecord) => {
		const db = await initAndGetDb()
		await db.put('files', { ...file, progress: 0, lastPlayed: 0 })
		handler.refetch()
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
		handler.refetch()
	}

	const ProgressBar = ({
		percent,
		className = '',
	}: {
		percent: number
		className?: string
	}) => (
		<div
			className={cn(
				'h-1 w-full overflow-hidden rounded-full bg-ink-100',
				className,
			)}
		>
			<div
				className="h-full rounded-full bg-ember-500 transition-[width] duration-300"
				style={{ width: `${percent}%` }}
			/>
		</div>
	)

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
					<Button onClick={() => inputRef.current?.click()} className="">
						Import SRT or ZIP
						<Show when={isProcessing}>
							<LoadingIcon />
						</Show>
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
					>
						Try with sample file
					</Button>
				</div>
			</Block>

			{/* Empty state teaches the space. */}
			<Show when={isEmpty}>
				<Block className="px-4 pt-8">
					<p className="text-base font-medium text-ink-900">No subtitle files yet</p>
					<p className="mt-1 max-w-prose text-sm text-ink-500">
						Import an SRT or ZIP to get started, or load the sample file
						above to see the player.
					</p>
				</Block>
			</Show>

			{/* One unified card list — most recently watched first */}
			<Show when={() => !isEmpty()}>
				<div className="flex flex-col gap-3 px-4 pt-6">
					<For each={files}>
						{(file) => {
							const percent = progressPercent(file)
							const showHistory = hasHistory(file)
							return (
								<RouterLink
									key={file.id}
									to={`/play?id=${file.id}`}
									className="block rounded-panel border border-edge bg-paper-raised p-4 hover:border-ink-400"
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0 flex-1">
											{renamingId() === file.id ? (
												<div className="flex items-center gap-2">
													<input
														autoFocus
														value={renameValue()}
														onChange={(e) => setRenameValue(e.target.value)}
														onKeyDown={(e) => {
															if (e.key === 'Enter') {
																void renameFile(file, renameValue())
															} else if (e.key === 'Escape') {
																setRenamingId(null)
															}
														}}
														className="w-full rounded-field border border-ink-400 bg-paper px-3 py-1.5 text-sm text-ink-900 focus:border-ember-600 focus:outline-none focus:ring-2 focus:ring-ember-600/30"
													/>
													<button
														type="button"
														aria-label="Save rename"
														className="flex h-9 w-9 flex-none items-center justify-center rounded-control text-ok hover:bg-ok-soft"
														onClick={(e) => {
															e.preventDefault()
															void renameFile(file, renameValue())
														}}
													>
														<CheckIcon />
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
														<MoreIcon className="rotate-90" />
													</button>
												</div>
											) : (
												<p className="truncate font-medium text-ink-900">
													{file.name}
												</p>
											)}
											{showHistory && (
												<p className="mt-1 text-xs text-ink-500">
													{percent}% · Resume at{' '}
													{formatTime(file.progress ?? 0)}
												</p>
											)}
											{!showHistory && metadataChips(file)}
										</div>
										<div className="flex flex-none items-center gap-1">
											<Menu
												trigger={(open, toggle) => (
													<button
														type="button"
														aria-label="File actions"
														aria-expanded={open}
														className={cn(
															'flex h-10 w-10 items-center justify-center rounded-control text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-900',
															open && 'bg-ink-50 text-ink-900',
														)}
														onClick={(e) => {
															e.preventDefault()
															e.stopPropagation()
															toggle()
														}}
													>
														<MoreIcon />
													</button>
												)}
											>
												{(close) => (
													<>
														<MenuAction
															onClick={() => {
																void clearProgress(file)
																close()
															}}
														>
															Clear watch progress
														</MenuAction>
														<MenuAction
															onClick={() => {
																setRenameValue(file.name)
																setRenamingId(file.id)
																close()
															}}
														>
															Rename
														</MenuAction>
														<MenuAction
															danger
															onClick={() => {
																void deleteFile(file)
																close()
															}}
														>
															Delete
														</MenuAction>
													</>
												)}
											</Menu>
										</div>
									</div>
									{showHistory && (
										<div className="mt-3">
											<ProgressBar percent={percent} />
										</div>
									)}
								</RouterLink>
							)
						}}
					</For>
				</div>
			</Show>

			<Block className="px-4 pt-4">
				<RouterLink
					to="/sync"
					className="flex items-center justify-between rounded-panel border border-ink-400 bg-paper-raised px-4 py-3 text-sm font-medium text-ink-900 hover:border-ink-600 hover:bg-ink-50"
				>
					Sync with another device
					<ChevronRightIcon className="text-ink-400" />
				</RouterLink>
			</Block>

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

	function metadataChips(file: FileRecord) {
		let metadata
		try {
			metadata = parseVideo(file.name)
		} catch (err) {
			console.warn(err)
		}
		return (
			<div className="flex gap-2">
				{metadata?.season && (
					<span className="text-xs text-ink-400">Season {metadata.season}</span>
				)}
				{metadata?.episode?.map((item) => (
					<span key={item} className="text-xs text-ink-400">
						Episode {item}
					</span>
				))}
			</div>
		)
	}
}
