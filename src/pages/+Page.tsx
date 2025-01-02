import {
	createResource,
	createSignal,
	createUniqueId,
	For,
	Show,
} from 'solid-js'
import parseVideo from 'video-name-parser'
import { BadgeBlue, BadgeRed } from '../components/badge'
import { addFileToDatabase, initAndGetDb } from '../utils'
import sampleSrtUrl from '../assets/sample.srt?url'

const LoadingIcon = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		class="h-5 w-5 animate-spin"
		viewBox="0 0 20 20"
		fill="currentColor"
	>
		<path
			fill-rule="evenodd"
			d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
			clip-rule="evenodd"
		/>
	</svg>
)

const EditFilesPage = () => {
	const id = createUniqueId()

	const [isProcessing, setProcessing] = createSignal(false)

	const [data, handler] = createResource(async () => {
		const db = await initAndGetDb()
		const files = await db.getAll('files')
		return files
	})

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

	return (
		<div class="min-h-full bg-gray-50">
			<div class="pt-safe"></div>

			<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				<div class="py-8">
					<h1 class="text-3xl font-bold text-gray-900">Subtitle App</h1>
					<p class="mt-2 text-sm text-gray-600">Play your subtitle files</p>
				</div>

				<div class="rounded-lg bg-white p-8 shadow-sm">
					<input
						id={`${id}-file-upload`}
						class="hidden"
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

					<div class="flex flex-col items-center justify-center">
						<label
							tabIndex={0}
							for={`${id}-file-upload`}
							class="flex items-center justify-center gap-3 rounded-lg bg-blue-600 px-6 py-3 text-lg font-medium text-white shadow-sm transition hover:bg-blue-700 active:bg-blue-800"
						>
							Import SRT or ZIP
							<Show when={isProcessing()}>
								<LoadingIcon />
							</Show>
						</label>

						<button
							type="button"
							class="mt-4 text-sm text-gray-600 hover:text-gray-900 hover:underline"
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

					<div class="mt-8 space-y-4">
						<For each={data()}>
							{(file) => {
								let metadata
								try {
									metadata = parseVideo(file.name)
								} catch (err) {
									console.warn(err)
								}

								return (
									<div class="group overflow-hidden rounded-lg border border-gray-200 bg-white transition hover:bg-gray-50">
										<a href={`/play?id=${file.id}`} class="block p-4">
											<div class="flex items-center justify-between">
												<div class="min-w-0 flex-1">
													<h3 class="truncate text-lg font-medium text-gray-900">
														{file.name}
													</h3>
													<div class="mt-2 flex flex-wrap gap-2">
														{metadata?.season && (
															<BadgeRed>Season {metadata.season}</BadgeRed>
														)}
														{metadata?.episode?.map((item) => (
															<BadgeBlue>Episode {item}</BadgeBlue>
														))}
													</div>
												</div>
												<button
													class="ml-4 flex-shrink-0 text-sm font-medium text-red-600 opacity-0 transition hover:text-red-900 group-hover:opacity-100"
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
										</a>
									</div>
								)
							}}
						</For>
					</div>
				</div>
			</div>

			<div class="pb-safe"></div>
		</div>
	)
}

export { EditFilesPage as Page }
