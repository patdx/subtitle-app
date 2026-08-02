import { Page } from '~/components'
import { sortBy } from 'lodash-es'
import { useNavigate } from 'react-router'
import { useSnapshot } from 'valtio'
import { syncState, syncStore, getCoordinatorId, seekTo } from '~/shared/sync'
import { TranscriptDisplay } from '~/shared/transcript-display'
import {
	clock,
	controlState,
	unfadeControls,
	setFile,
	getFile,
	getTimeElapsed,
} from '~/shared/utils'
import type { Route } from './+types/play'

// TODO: update the whole page bg to black when this page is open

export default function PlayPage() {
	return (
		<Page>
			<Play />
		</Page>
	)
}

const Play = () => {
	const navigate = useNavigate()
	const syncSnap = useSnapshot(syncState)
	const clockSnap = useSnapshot(clock)

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
		if (file?.progress && syncState.role === 'none') {
			seekTo(file.progress)
		}
	}

	async function saveProgress() {
		const lines = getFile()
		const fileId = lines?.[0]?.fileId
		if (!fileId || syncState.role !== 'none') return
		const elapsed = getTimeElapsed()
		if (elapsed <= 0) return
		const db = await initAndGetDb()
		const file = await db.get('files', fileId)
		if (!file) return
		await db.put('files', {
			...file,
			progress: elapsed,
			lastPlayed: Date.now(),
		})
	}

	useEffect(() => {
		loadFile()
		// Reconnect any previously active pairing (own device or joined one).
		void syncStore.restore()
	}, [])

	// Save position when playback starts and pauses, so a refresh during
	// playback restores to near where playback began rather than the last pause.
	useEffect(() => {
		void saveProgress()
	}, [clockSnap.isPlaying])

	// Save position when leaving the player.
	useEffect(() => {
		return () => {
			void saveProgress()
		}
	}, [])

	// When becoming the internal coordinator with a file already loaded,
	// announce it to the rest of the group.
	const isCoordinator =
		syncSnap.role === 'peer' &&
		getCoordinatorId(syncSnap) === syncSnap.sessionId
	useEffect(() => {
		if (isCoordinator) {
			void syncStore.onFileLoaded()
		}
	}, [isCoordinator])

	// When the group coordinator announces a file, open it if needed.
	useEffect(() => {
		const pending = syncSnap.pendingNowPlaying
		if (!pending) return
		const lines = getFile()
		if (!lines || lines.length === 0) {
			syncStore.consumePendingNowPlaying()
			navigate(`/play?id=${pending.fileId}`)
		}
	}, [syncSnap.pendingNowPlaying])

	return (
		<>
			<div
				className="player-overlay relative h-full overflow-hidden bg-black"
				onPointerDown={() => {
					if (controlState.isOpen && controlState.faded) {
						unfadeControls()
					}
				}}
			>
				<FileDisplay />
				<TranscriptDisplay />
				<Controls />
			</div>
		</>
	)
}
