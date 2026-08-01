import { Page } from '~/components'
import { sortBy } from 'lodash-es'
import { observer } from 'mobx-react-lite'
import { useNavigate } from 'react-router'
import { syncStore } from '~/shared/sync'
import { TranscriptDisplay } from '~/shared/transcript-display'

// TODO: update the whole page bg to black when this page is open

export default function PlayPage() {
	return (
		<Page>
			<Play />
		</Page>
	)
}

const Play = observer(() => {
	const navigate = useNavigate()

	async function loadFile() {
		const fileId = new URL(location.href).searchParams.get('id')
		if (!fileId) {
			console.warn(`No id provided, waiting for file id...`)
			return
		}
		const db = await initAndGetDb()
		let lines = await db.getAllFromIndex('lines', 'by-file-id', fileId)
		lines = sortBy(lines, (line) => line.from)
		setFile(lines)
		void syncStore.onFileLoaded()

		// Resume from the last saved position (unless synced to another device).
		const file = await db.get('files', fileId)
		if (file?.progress && syncStore.role === 'none') {
			seekTo(file.progress)
		}
	}

	async function saveProgress() {
		const lines = getFile()
		const fileId = lines?.[0]?.fileId
		if (!fileId || syncStore.role !== 'none') return
		const elapsed = getTimeElapsed()
		if (elapsed <= 0) return
		const db = await initAndGetDb()
		const file = await db.get('files', fileId)
		if (!file) return
		await db.put('files', { ...file, progress: elapsed })
	}

	useEffect(() => {
		loadFile()
		// Reconnect any previously active pairing (own device or joined one).
		void syncStore.restore()
	}, [])

	// Save position whenever playback is paused.
	useEffect(() => {
		if (!clock.isPlaying) {
			void saveProgress()
		}
	}, [clock.isPlaying])

	// Save position when leaving the player.
	useEffect(() => {
		return () => {
			void saveProgress()
		}
	}, [])

	// When becoming the host while a file is already loaded (e.g. the user
	// started hosting from the sync page), announce the current file.
	useEffect(() => {
		if (syncStore.role === 'host') {
			void syncStore.onFileLoaded()
		}
	}, [syncStore.role])

	// When the host announces a file and we don't have one loaded, open it.
	useEffect(() => {
		const pending = syncStore.pendingNowPlaying
		if (!pending) return
		const lines = getFile()
		if (!lines || lines.length === 0) {
			syncStore.consumePendingNowPlaying()
			navigate(`/play?id=${pending.fileId}`)
		}
	}, [syncStore.pendingNowPlaying])

	return (
		<>
			<div
				className="relative h-full overflow-hidden bg-black"
				onPointerDown={() => {
					if (controlState.isOpen && controlState.faded) {
						controlState.unfade()
					}
				}}
			>
				<FileDisplay />
				<TranscriptDisplay />
				<Controls />
			</div>
		</>
	)
})
