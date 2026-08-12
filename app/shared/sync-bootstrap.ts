import { subscribe } from 'valtio'
import { getActivePlayerId, syncState, syncStore } from './sync'
import { uiState } from './utils'

let didBootstrap = false

type AppNavigate = (to: string) => void

let appNavigate: AppNavigate | null = null
/** While true, the play page is applying a loaded file — don't yank the URL. */
let fileFollowPaused = false

/** Bound from the router on each App render (latest ref, no effect). */
export function setAppNavigate(navigate: AppNavigate) {
	appNavigate = navigate
}

export function setFileFollowPaused(paused: boolean) {
	fileFollowPaused = paused
}

function followNowPlayingFile() {
	if (fileFollowPaused) return
	const fileId = syncState.nowPlayingFile?.fileId
	if (!fileId) return

	const isActivePlayer = getActivePlayerId(syncState) === syncState.sessionId
	const onPlayPage = location.pathname === '/play'
	// Active player always follows the cast file. Remotes only follow when
	// already on /play (e.g. opened the now-playing bar before a transfer finished).
	if (!isActivePlayer && !onPlayPage) return

	const currentId = uiState.file?.[0]?.fileId
	if (currentId === fileId) return
	const url = new URL(location.href)
	if (onPlayPage && url.searchParams.get('id') === fileId) return
	appNavigate?.(`/play?id=${fileId}`)
}

/**
 * One-shot app init (advanced-init-once): reconnect the last group, honor
 * `/sync?code=` deep links, wire now-playing → route follow, and probe
 * fullscreen after the first client render matches prerendered HTML.
 */
export function bootstrapSync() {
	if (didBootstrap) return
	didBootstrap = true

	subscribe(syncState, followNowPlayingFile)

	const url = new URL(location.href)
	const codeParam =
		url.pathname === '/sync' || url.pathname === '/sync/'
			? url.searchParams.get('code')
			: null

	void (async () => {
		await syncStore.init()
		if (codeParam) {
			window.history.replaceState(null, '', url.pathname)
			const normalized = codeParam
				.toUpperCase()
				.replace(/[^A-Z0-9]/g, '')
				.slice(0, 20)
			if (normalized.length === 20 && normalized !== syncState.myGroupCode) {
				await syncStore.joinGroup(normalized)
				return
			}
		}
		await syncStore.restore()
	})()
}

if (typeof document !== 'undefined') {
	bootstrapSync()
}
