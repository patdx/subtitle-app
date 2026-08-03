import { useQuery } from '@tanstack/react-query'
import { BackToLibraryLink, Page } from '~/components'
import { useSearchParams } from 'react-router'
import { useSnapshot } from 'valtio'
import {
	syncState,
	syncStore,
	isRemote,
	isRemoteController,
	seekTo,
	ensureProgressPagehide,
} from '~/shared/sync'
import { setFileFollowPaused } from '~/shared/sync-bootstrap'
import { fileQueryOptions, type LoadedPlayerFile } from '~/shared/file-queries'
import { usePlayerKeyboard } from '~/shared/player-keyboard'
import { RemotePanel } from '~/shared/remote-panel'
import { SyncPill } from '~/shared/sync-pill'
import { TranscriptDisplay } from '~/shared/transcript-display'
import {
	controlState,
	unfadeControls,
	setFile,
	pokeControls,
	saveLocalProgress,
} from '~/shared/utils'

// TODO: update the whole page bg to black when this page is open

export default function PlayPage() {
	return (
		<Page>
			<Play />
		</Page>
	)
}

function applyLoadedFile(data: LoadedPlayerFile) {
	setFileFollowPaused(true)
	try {
		const playerFile = data.file?.hash
			? {
					fileId: data.fileId,
					hash: data.file.hash,
					name: data.file.name ?? '',
				}
			: undefined

		// Spotify-style: an online player device owns playback. Casting a
		// different file must not load it locally as if we were the renderer.
		if (isRemoteController(syncState)) {
			const castingDifferent =
				!!playerFile && syncState.nowPlayingFile?.hash !== playerFile.hash
			if (castingDifferent) {
				void syncStore.playFile(playerFile.hash, playerFile.name)
				return
			}
			// Same file as now-playing (e.g. follow navigation): load cues only.
			setFile(data.lines)
			ensureProgressPagehide()
			return
		}

		setFile(data.lines)
		ensureProgressPagehide()

		// No online player (or we are the player): play here. Opening a file
		// never steals the stage from an online claimed player — that path
		// is handled above via playFile.
		if (syncState.role === 'peer') {
			void syncStore.becomeActivePlayer(playerFile)
		} else if (playerFile) {
			// Not connected yet: claim once the group settles, unless a peer
			// is already playing (the engine resolves that deterministically).
			syncStore.requestPlayerRole(playerFile)
		}

		// Resume from the last saved position (unless synced to another device).
		if (data.file?.progress && syncState.role === 'none') {
			seekTo(data.file.progress)
		}
	} finally {
		setFileFollowPaused(false)
	}
}

const Play = () => {
	const [searchParams] = useSearchParams()
	const fileIdParam = searchParams.get('id')
	const syncSnap = useSnapshot(syncState)

	usePlayerKeyboard()

	const fileQuery = useQuery({
		...fileQueryOptions(fileIdParam ?? ''),
		enabled: Boolean(fileIdParam),
	})

	// Sync query result → Valtio / sync roles (external systems).
	useEffect(() => {
		const data = fileQuery.data
		if (!data || data.fileId !== fileIdParam || !data.file) return
		applyLoadedFile(data)
	}, [fileQuery.data, fileIdParam])

	// Save when leaving the player route (in-app navigations).
	useEffect(() => {
		return () => {
			if (syncState.role === 'none') void saveLocalProgress()
		}
	}, [])

	const remote = isRemote(syncSnap)
	const isFileLoading = Boolean(fileIdParam) && fileQuery.isPending
	const isFileMissing =
		Boolean(fileIdParam) &&
		fileQuery.isFetched &&
		!fileQuery.isPending &&
		!fileQuery.data?.file

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
				{isFileLoading ? (
					<div className="absolute inset-0 z-10 flex items-center justify-center">
						<p className="text-sm text-ink-500">Loading…</p>
					</div>
				) : isFileMissing ? (
					<div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 px-4 text-center">
						<p className="text-sm text-ink-400">File not found</p>
						<BackToLibraryLink />
					</div>
				) : remote ? (
					<>
						<RemotePanel />
						<TranscriptDisplay />
					</>
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
