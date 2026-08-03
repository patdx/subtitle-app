import { Page } from '~/components'
import { sortBy } from 'lodash-es'
import { useNavigate, useSearchParams } from 'react-router'
import { useSnapshot } from 'valtio'
import {
	syncState,
	syncStore,
	isRemote,
	isRemoteController,
	getActivePlayerId,
	seekTo,
} from '~/shared/sync'
import { RemotePanel } from '~/shared/remote-panel'
import { SyncPill } from '~/shared/sync-pill'
import { TranscriptDisplay } from '~/shared/transcript-display'
import {
	clock,
	controlState,
	unfadeControls,
	setFile,
	getFile,
	getTimeElapsed,
	pokeControls,
	uiState,
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
	const [searchParams] = useSearchParams()
	const fileIdParam = searchParams.get('id')
	const syncSnap = useSnapshot(syncState)
	const clockSnap = useSnapshot(clock)
	const uiSnap = useSnapshot(uiState)

	/** Set while a file is loading so the renderer-follow doesn't yank a manual load. */
	const isLoadingRef = useRef(false)

	async function loadFile() {
		isLoadingRef.current = true
		if (!fileIdParam) {
			isLoadingRef.current = false
			console.warn(`No id provided, waiting for file id...`)
			return
		}
		const db = await initAndGetDb()
		let lines = await db.getAllFromIndex('lines', 'by-file-id', fileIdParam)
		lines = sortBy(lines, (line) => line.from)
		setFile(lines)

		const file = await db.get('files', fileIdParam)
		const playerFile = file?.hash
			? { fileId: fileIdParam, hash: file.hash, name: file.name ?? '' }
			: undefined

		// A remote controller picks a file: cast it to the active player.
		if (isRemoteController(syncSnap)) {
			if (playerFile) void syncStore.playFile(playerFile.hash, playerFile.name)
			isLoadingRef.current = false
			return
		}

		// This device is (or becomes) the active player.
		if (syncState.role === 'peer') {
			void syncStore.becomeActivePlayer(playerFile)
		} else if (playerFile) {
			// Not connected yet: claim once the group settles, unless a peer
			// is already playing (the engine resolves that deterministically).
			syncStore.requestPlayerRole(playerFile)
		}

		// Resume from the last saved position (unless synced to another device).
		if (file?.progress && syncState.role === 'none') {
			seekTo(file.progress)
		}
		isLoadingRef.current = false
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
		void loadFile()
	}, [fileIdParam])

	// The renderer follows the group's cast file: when this device is the
	// player and the announced file differs from what's loaded, open it.
	useEffect(() => {
		if (getActivePlayerId(syncSnap) !== syncSnap.sessionId) return
		const np = syncSnap.nowPlayingFile
		if (!np?.fileId) return
		const currentId = uiSnap.file?.[0]?.fileId
		if (currentId !== np.fileId && !isLoadingRef.current) {
			navigate(`/play?id=${np.fileId}`)
		}
	}, [
		syncSnap.coordinationClaim,
		syncSnap.sessionId,
		syncSnap.nowPlayingFile,
		uiSnap.file,
	])

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

	const remote = isRemote(syncSnap)

	return (
		<>
			<div
				className="player-overlay relative h-full overflow-hidden bg-black"
				onPointerDown={() => {
					if (controlState.faded) {
						unfadeControls()
					}
				}}
				onPointerMove={() => {
					// Mouse movement reveals the controls (Netflix-style): unfade
					// immediately and restart the auto-hide timer.
					if (controlState.faded) {
						unfadeControls()
					}
					pokeControls()
				}}
			>
				{remote ? (
					<RemotePanel />
				) : (
					<>
						<FileDisplay />
						<TranscriptDisplay />
						<Controls />
					</>
				)}
				<SyncPill />
			</div>
		</>
	)
}
