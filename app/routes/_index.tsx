import { Navbar, Page } from 'konsta/react'
import type { Route } from './+types/_index'
import { useQuery } from '@tanstack/react-query'
import sampleSrtUrl from '../assets/sample.srt?url'
import { Link } from 'react-router'
import { once } from 'lodash-es'
import { use } from 'react'

const parseVideoPromise = once(() =>
	import('video-name-parser').then((mod) => mod.default),
)

export function meta({}: Route.MetaArgs) {
	return [
		{ title: 'Subtitle App' },
		// { name: 'description', content: 'Welcome to React Router!' },
	]
}

export default function Home({ loaderData }: Route.ComponentProps) {
	return (
		<Page>
			<Navbar title="Subtitle App" />
			<EditFilesPage />
		</Page>
	)
}

const EditFilesPage = () => {
	const id = useId()

	const [isProcessing, setProcessing] = useSignal(false)

	const result = useQuery({
		queryKey: ['files'],
		queryFn: async () => {
			const db = await initAndGetDb()
			const files = await db.getAll('files')
			return files
		},
	})

	// [data, handler]

	const data = () => result.data
	const handler = {
		refetch: result.refetch,
	}

	const handleFile = async (file: File) => {
		try {
			setProcessing(true)

			console.log(file.name, file.type)

			if (/.zip$/i.test(file.name) || file.type === 'application/zip') {
				const zip = await import('@zip.js/zip.js')
				const reader = new zip.ZipReader(new zip.BlobReader(file))
				const entries = await reader.getEntries()
				console.log(entries)
				for (const entry of entries) {
					if (/.srt$/i.test(entry.filename) && entry.getData) {
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
			} else {
				await addFileToDatabase(await file.text(), file.name)
			}
			handler.refetch()
		} finally {
			setProcessing(false)
		}
	}

	const parseVideo = use(parseVideoPromise())

	return (
		<div className="min-h-full bg-gray-50">
			<div className="pt-safe"></div>

			<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				<div className="py-8">
					<h1 className="text-3xl font-bold text-gray-900">Subtitle App</h1>
					<p className="mt-2 text-sm text-gray-600">Play your subtitle files</p>
				</div>

				<div className="rounded-lg bg-white p-8 shadow-sm">
					<input
						id={`${id}-file-upload`}
						className="hidden"
						type="file"
						accept=".zip,.srt,application/zip"
						onChange={async (event) => {
							const target = event.target as HTMLInputElement
							const file = target.files?.[0]
							target.value = ''
							if (!file) return
							await handleFile(file)
						}}
					/>

					<div className="flex flex-col items-center justify-center">
						<label
							tabIndex={0}
							htmlFor={`${id}-file-upload`}
							className="flex items-center justify-center gap-3 rounded-lg bg-blue-600 px-6 py-3 text-lg font-medium text-white shadow-sm transition hover:bg-blue-700 active:bg-blue-800"
						>
							Import SRT or ZIP
							<Show when={isProcessing}>
								<LoadingIcon />
							</Show>
						</label>

						<button
							type="button"
							className="mt-4 text-sm text-gray-600 hover:text-gray-900 hover:underline"
							onClick={async () => {
								const blob = await fetch(sampleSrtUrl).then((result) =>
									result.blob(),
								)
								const file = new File([blob], 'sample.srt')
								await handleFile(file)
							}}
						>
							or try with a sample file
						</button>
					</div>

					<div className="mt-8 space-y-4">
						<For each={data}>
							{(file) => {
								let metadata
								try {
									metadata = parseVideo(file.name)
								} catch (err) {
									console.warn(err)
								}

								return (
									<div
										key={file.id}
										className="group overflow-hidden rounded-lg border border-gray-200 bg-white transition hover:bg-gray-50"
									>
										<Link to={`/play?id=${file.id}`} className="block p-4">
											<div className="flex items-center justify-between">
												<div className="min-w-0 flex-1">
													<h3 className="truncate text-lg font-medium text-gray-900">
														{file.name}
													</h3>
													<div className="mt-2 flex flex-wrap gap-2">
														{metadata?.season && (
															<BadgeRed>Season {metadata.season}</BadgeRed>
														)}
														{metadata?.episode?.map((item) => (
															<BadgeBlue>Episode {item}</BadgeBlue>
														))}
													</div>
												</div>
												<button
													className="ml-4 flex-shrink-0 text-sm font-medium text-red-600 opacity-0 transition hover:text-red-900 group-hover:opacity-100"
													onClick={async (e) => {
														e.preventDefault()
														const db = await initAndGetDb()
														const tx = db.transaction(
															['files', 'lines'],
															'readwrite',
														)
														tx.objectStore('files').delete(file.id)
														let cursor = await tx
															.objectStore('lines')
															.index('by-file-id')
															.openKeyCursor(file.id)
														while (cursor) {
															await tx
																.objectStore('lines')
																.delete(cursor.primaryKey)
															cursor = await cursor.continue()
														}
														tx.commit()
														handler.refetch()
													}}
												>
													Delete
												</button>
											</div>
										</Link>
									</div>
								)
							}}
						</For>
					</div>
				</div>
			</div>

			<div className="pb-safe"></div>
		</div>
	)
}
