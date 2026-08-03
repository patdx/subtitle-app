import { Link } from 'react-router'
import { useSnapshot } from 'valtio'
import { cn } from '~/shared/utils'
import {
	syncState,
	activePlayerName,
	activePlayerOnline,
	isRenderer,
	isRemote,
} from './sync'

/**
 * Persistent sync status pill shown in the player (never auto-fades).
 * Clicking it opens the pairing page.
 */
export const SyncPill = () => {
	const syncSnap = useSnapshot(syncState)
	const inGroup = syncSnap.role === 'peer'

	let label = 'Not synced'
	let dot = 'bg-ink-400'

	if (inGroup) {
		if (isRenderer(syncSnap)) {
			label = syncSnap.nowPlayingFile
				? 'Playing on this device'
				: 'Ready to play'
			dot = 'bg-ok'
		} else if (isRemote(syncSnap)) {
			const playerName = activePlayerName(syncSnap)
			if (playerName && activePlayerOnline(syncSnap)) {
				label = `Playing on ${playerName}`
				dot = 'bg-ok'
			} else {
				label = 'Player offline'
				dot = 'bg-warn'
			}
		} else {
			const count =
				syncSnap.roomPeers.filter((peer) => peer.connected).length + 1
			label = count > 1 ? `Synced · ${count} devices` : 'Synced'
			dot = 'bg-ok'
		}
	} else if (
		syncSnap.connectionState === 'connecting' ||
		syncSnap.isRestoring
	) {
		label = 'Connecting…'
		dot = 'bg-warn'
	}

	return (
		<Link
			to="/sync"
			aria-label="Sync status"
			className="pointer-events-auto absolute left-1/2 top-safe-or-3 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-ink-700 bg-black/60 px-2.5 py-1 text-xs font-medium text-ink-200 backdrop-blur transition-colors hover:text-white"
		>
			<span className={cn('h-2 w-2 rounded-full', dot)} />
			{label}
		</Link>
	)
}
