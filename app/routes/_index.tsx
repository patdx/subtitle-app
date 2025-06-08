import { useQuery } from '@tanstack/react-query'
import { once } from 'lodash-es'
import { use } from 'react'
import { Link as RouterLink } from 'react-router'
import { Block, Button, List, ListItem, Navbar, Page } from '~/components'
import sampleSrtUrl from '../assets/sample.srt?url'
import type { Route } from './+types/_index'

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
			<Navbar title="Subtitle App" large transparent centerTitle />
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

	const data = () => result.data
	const handler = {
		refetch: result.refetch,
	}

	const handleFile = async (file: File) => {
		try {
			setProcessing(true)

			console.log(file.name, file.type)

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

	const inputRef = useRef<HTMLInputElement>(null)

	const parseVideo = use(parseVideoPromise())

	return (
		<>
			<Block className="px-4">
				<p className="text-sm text-gray-600">
					Import and manage your subtitle files
				</p>
			</Block>

			<Block strong inset className="gap-4 text-center flex flex-col">
				<input
					ref={inputRef}
					id={`${id}-file-upload`}
					className="hidden"
					type="file"
					// accept=".srt,.zip,text/plain,text/srt,application/x-subrip,application/zip"
					onChange={async (event) => {
						const target = event.target as HTMLInputElement
						const file = target.files?.[0]
						target.value = ''
						if (!file) return
						await handleFile(file)
					}}
				/>

				<div className="flex flex-col justify-center self-center">
					<Button
						onClick={() => inputRef.current?.click()}
						// component="label"

						// htmlFor={`${id}-file-upload`}
						className="button-large button-rounded button-raised"
					>
						Import SRT or ZIP
						<Show when={isProcessing}>
							<LoadingIcon />
						</Show>
					</Button>

					<Button
						className="mt-4 button-clear"
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

			<List className="list-strong-ios list-outline-ios">
				<For each={data}>
					{(file) => {
						let metadata
						try {
							metadata = parseVideo(file.name)
						} catch (err) {
							console.warn(err)
						}

						return (
							<ListItem
								key={file.id}
								title={file.name}
								after={
									<Button
										className="k-color-brand-red button-clear"
										onClick={async (e) => {
											e.preventDefault()
											const db = await initAndGetDb()
											const tx = db.transaction(['files', 'lines'], 'readwrite')
											tx.objectStore('files').delete(file.id)
											let cursor = await tx
												.objectStore('lines')
												.index('by-file-id')
												.openKeyCursor(file.id)
											while (cursor) {
												await tx.objectStore('lines').delete(cursor.primaryKey)
												cursor = await cursor.continue()
											}
											tx.commit()
											handler.refetch()
										}}
									>
										Delete
									</Button>
								}
								footer={
									<div className="flex gap-2">
										{metadata?.season && (
											<span className="text-red-600">
												Season {metadata.season}
											</span>
										)}
										{metadata?.episode?.map((item) => (
											<span className="text-blue-600">Episode {item}</span>
										))}
									</div>
								}
								asChild
							>
								<RouterLink to={`/play?id=${file.id}`} />
							</ListItem>
						)
					}}
				</For>
			</List>

			<Block className="px-4 mt-4 text-center">
				<RouterLink to="/about" className="text-sm text-blue-600">
					About this app
				</RouterLink>
			</Block>
		</>
	)
}
