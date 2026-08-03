import { useSnapshot } from 'valtio'
import {
	MenuItem,
	MenuPopup,
	MenuPortal,
	MenuPositioner,
	MenuRoot,
	MenuTrigger,
} from '~/components/ui/menu'
import { cn } from '~/shared/utils'
import { syncState, syncStore, getActivePlayerId } from './sync'
import { CheckIcon } from './icons'

/**
 * Spotify-style "play on this device" popup: lists every device in the group
 * (including this one) and picks which one becomes the active player.
 * The renderer shows the subtitles; every other device becomes a remote.
 */
export const DevicesMenu = ({
	children,
}: {
	/** The trigger element (a button). */
	children: React.ReactElement
}) => {
	const syncSnap = useSnapshot(syncState)
	const activeId = getActivePlayerId(syncSnap)

	const devices: {
		sessionId: string | null
		name: string
		connected: boolean
	}[] = [
		{ sessionId: syncSnap.sessionId, name: 'This device', connected: true },
		...syncSnap.roomPeers.map((peer) => ({
			sessionId: peer.sessionId,
			name: peer.name,
			connected: peer.connected,
		})),
	]

	return (
		<MenuRoot>
			<MenuTrigger render={children} />
			<MenuPortal>
				<MenuPositioner align="end" side="bottom">
					<MenuPopup className="min-w-52">
						<p className="px-2.5 py-1.5 text-xs text-muted-foreground">
							Play on
						</p>
						{devices.map((device) => {
							const isActive =
								device.sessionId !== null && device.sessionId === activeId
							return (
								<MenuItem
									key={device.sessionId ?? 'this-device'}
									disabled={!device.connected}
									onClick={() => {
										if (device.sessionId) syncStore.setPlayer(device.sessionId)
									}}
									className="justify-between"
								>
									<span className="flex items-center gap-2">
										<span
											className={cn(
												'h-2 w-2 flex-none rounded-full',
												isActive
													? 'bg-ok'
													: device.connected
														? 'bg-ink-400'
														: 'bg-ink-200',
											)}
										/>
										<span className="truncate">{device.name}</span>
										{!device.connected && (
											<span className="text-xs text-muted-foreground">
												offline
											</span>
										)}
									</span>
									{isActive && <CheckIcon className="size-4 text-ink-200" />}
								</MenuItem>
							)
						})}
					</MenuPopup>
				</MenuPositioner>
			</MenuPortal>
		</MenuRoot>
	)
}
