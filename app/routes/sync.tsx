import { Link as RouterLink } from 'react-router'
import { useSnapshot } from 'valtio'
import { BackButton, Block, List, ListItem, Navbar, Page } from '~/components'
import { Alert, AlertDescription } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Skeleton } from '~/components/ui/skeleton'
import { QrCode } from '~/shared/qr'
import { QrScanner } from '~/shared/qr-scanner'
import { buttonChrome, cn } from '~/shared/utils'
import { syncState, syncStore, type ConnectionState } from '~/shared/sync'
import type { Route } from './+types/sync'

export function meta({}: Route.MetaArgs) {
	return [{ title: 'Sync - Subtitle App' }]
}

/** Dot color + status label for the connection status block. */
const getConnectionStatus = (
	connectionState: ConnectionState,
	isRestoring: boolean,
	roomCode: string | null,
): { dot: string; label: string } => {
	const restoring = isRestoring || connectionState === 'connecting'
	if (connectionState === 'connected') {
		return {
			dot: 'bg-ok',
			label: restoring ? 'Connecting…' : `Connected to group ${roomCode ?? ''}`,
		}
	}
	if (connectionState === 'error') {
		return {
			dot: 'bg-danger',
			label: restoring ? 'Connecting…' : 'Not connected',
		}
	}
	if (restoring) {
		return { dot: 'bg-warn', label: 'Connecting…' }
	}
	return { dot: 'bg-ink-300', label: 'Not sharing' }
}

const SyncPage = () => {
	const syncSnap = useSnapshot(syncState)
	const [codeInput, setCodeInput] = useState('')
	const [busy, setBusy] = useState(false)

	async function join(codeOverride?: string) {
		const code = (codeOverride ?? codeInput).trim()
		if (code.length !== 20) return
		setBusy(true)
		try {
			await syncStore.joinGroup(code)
		} catch (err) {
			setBusy(false)
			throw err
		}
		setBusy(false)
	}

	async function retry() {
		if (syncState.joinedGroupCode) {
			await syncStore.joinGroup(syncState.joinedGroupCode)
		} else {
			await syncStore.startSharing()
		}
	}

	const connecting = syncSnap.connectionState === 'connecting'
	const connected = syncSnap.connectionState === 'connected'
	const active = syncSnap.role === 'peer'
	const qrValue = syncSnap.roomCode
		? `${location.origin}/sync?code=${syncSnap.roomCode}`
		: ''
	const status = getConnectionStatus(
		syncSnap.connectionState,
		syncSnap.isRestoring,
		syncSnap.roomCode,
	)

	return (
		<Page>
			<Navbar title="Sync" left={<BackButton />} />

			<Block className="px-4 pb-2">
				<p className="max-w-prose text-sm text-ink-500">
					Pair your own devices and control playback together.
				</p>
				<p className="mt-2 max-w-prose text-sm text-ink-500">
					After devices connect, playback timing and subtitle files go directly
					between them. Subtitle files stay on your devices — they are never
					uploaded to our servers.
				</p>
				<p className="mt-2 max-w-prose text-sm text-ink-500">
					Our server only relays short connection-setup messages so devices can
					link. Subtitle files and playback timing never go through it. Devices
					must be on networks that allow a direct connection.
				</p>
			</Block>

			<Block className="px-4">
				<label className="flex items-center gap-2 text-sm">
					<span className="text-ink-500">Device name</span>
					<Input
						value={syncSnap.settingsReady ? syncSnap.deviceName : ''}
						onChange={(e) => {
							void syncStore.setDeviceName(e.target.value)
						}}
						disabled={!syncSnap.settingsReady}
						placeholder={syncSnap.settingsReady ? undefined : '…'}
						className="flex-1 rounded-field border-edge bg-paper-raised px-3 py-1.5 text-base text-ink-900 placeholder:text-ink-400 sm:text-sm"
						maxLength={24}
					/>
				</label>
			</Block>

			{/* ---------------------------------------------------------- */}
			{/* Status + own group                                          */}
			{/* ---------------------------------------------------------- */}
			<Block className="px-4">
				{syncSnap.error && (
					<Alert variant="destructive" className="mb-3">
						<AlertDescription>{syncSnap.error}</AlertDescription>
					</Alert>
				)}

				<div className="flex items-center justify-between">
					<span
						className={cn(
							'flex items-center gap-2 text-sm font-medium',
							connected
								? 'text-ok'
								: syncSnap.connectionState === 'error'
									? 'text-danger'
									: 'text-ink-600',
						)}
					>
						<span className={cn('h-2.5 w-2.5 rounded-full', status.dot)} />
						{status.label}
					</span>
					{syncSnap.connectionState === 'error' && active === false && (
						<Button
							variant="secondary"
							onClick={() => void retry()}
							disabled={busy}
							className={cn(buttonChrome, 'border-ink-400')}
						>
							Retry
						</Button>
					)}
				</div>
			</Block>

			{/* ---------------------------------------------------------- */}
			{/* Active group: code + QR + members                            */}
			{/* ---------------------------------------------------------- */}
			{active && (
				<>
					<Block className="px-4">
						<div className="rounded-panel border border-edge bg-paper-raised p-5 text-center">
							<p className="text-xs uppercase tracking-widest text-ink-400">
								Your group code
							</p>
							<p className="mt-2 font-mono text-3xl font-bold tracking-[0.35em] text-ink-900">
								{syncSnap.roomCode}
							</p>
							<div className="mx-auto mt-4 w-44 bg-white p-2">
								<QrCode value={qrValue} size={160} />
							</div>
							<p className="mt-3 text-xs text-ink-500">
								Scan this once on another device to add it to this group.
							</p>
							<div className="mt-4 flex flex-wrap items-center justify-center gap-2">
								<Button
									variant="secondary"
									onClick={() => {
										void navigator.clipboard?.writeText(qrValue).catch(() => {})
									}}
									className={cn(buttonChrome, 'border-ink-400')}
								>
									Copy link
								</Button>
								<Button
									variant="destructive"
									onClick={() => {
										void (syncState.joinedGroupCode
											? syncStore.leaveGroup()
											: syncStore.stopSharing())
									}}
									className={buttonChrome}
								>
									Disconnect
								</Button>
								<Button
									variant="link"
									onClick={() => void syncStore.createNewGroup()}
									className={cn(
										buttonChrome,
										'text-ember-600 hover:text-ember-700 underline-offset-2',
									)}
								>
									Create new group
								</Button>
							</div>
						</div>
					</Block>

					<MembersList />
					<ReceivedFilesList />
				</>
			)}

			{/* ---------------------------------------------------------- */}
			{/* Idle: start sharing / join                                   */}
			{/* ---------------------------------------------------------- */}
			{!active && (
				<>
					<Block className="px-4">
						<div className="rounded-panel border border-edge bg-paper-raised p-5 text-center">
							<p className="text-sm font-medium text-ink-900">This device</p>
							{!syncSnap.settingsReady ? (
								<div className="mt-2 flex justify-center">
									<Skeleton className="h-8 w-56" aria-hidden />
								</div>
							) : syncSnap.myGroupCode ? (
								<p className="mt-2 font-mono text-2xl font-bold tracking-[0.3em] text-ink-900">
									{syncSnap.myGroupCode}
								</p>
							) : (
								<p className="mt-1 text-sm text-ink-500">
									You'll get a permanent code when you start pairing.
								</p>
							)}
							<Button
								className={cn(buttonChrome, 'mt-4 w-full')}
								onClick={() => void syncStore.startSharing()}
								disabled={busy || connecting}
							>
								{busy || connecting ? 'Connecting…' : 'Start pairing'}
							</Button>
							<p className="mt-2 text-xs text-ink-500">
								Scan this code from your other device (phone, tablet, TV box) to
								connect it.
							</p>
						</div>
					</Block>

					<Block className="px-4">
						<h2 className="text-sm font-medium text-ink-600">
							Connect another device
						</h2>
					</Block>
					<Block className="flex flex-col gap-3 px-4 pb-safe-or-8">
						<Input
							value={codeInput}
							onChange={(e) =>
								setCodeInput(
									e.target.value
										.toUpperCase()
										.replace(/[^A-Z0-9]/g, '')
										.slice(0, 20),
								)
							}
							placeholder="Enter the code shown on the other device"
							className="w-full rounded-field border-edge bg-paper-raised px-3 py-2 text-center font-mono text-xl tracking-widest text-ink-900 placeholder:text-ink-400"
							maxLength={20}
							autoCapitalize="characters"
							autoCorrect="off"
							spellCheck={false}
						/>
						<Button
							onClick={() => void join()}
							disabled={busy || connecting || codeInput.trim().length !== 20}
							className={buttonChrome}
						>
							{busy || connecting ? 'Connecting…' : 'Connect'}
						</Button>
						<QrScanner
							onScan={(code) => {
								setCodeInput(code)
								void join(code)
							}}
						/>
					</Block>
				</>
			)}
		</Page>
	)
}

const MembersList = () => {
	const syncSnap = useSnapshot(syncState)
	if (syncSnap.roomPeers.length === 0) return null
	return (
		<>
			<Block className="px-4">
				<h2 className="text-sm font-medium text-ink-600">Connected devices</h2>
			</Block>
			<List className="pb-safe-or-8">
				{syncSnap.roomPeers.map((peer) => (
					<ListItem
						key={peer.sessionId}
						title={peer.name}
						after={<span className="text-xs text-ink-400">Device</span>}
						footer={
							<span
								className={cn(
									'text-xs',
									peer.connected ? 'text-ok' : 'text-ink-400',
								)}
							>
								{peer.connected ? 'Connected' : 'Connecting…'}
							</span>
						}
					/>
				))}
			</List>
		</>
	)
}

const ReceivedFilesList = () => {
	const syncSnap = useSnapshot(syncState)
	if (syncSnap.transfers.length === 0 && syncSnap.receivedFiles.length === 0) {
		return null
	}
	return (
		<>
			{syncSnap.transfers.length > 0 && (
				<Block className="px-4">
					<p className="text-sm font-medium">Receiving files…</p>
					{syncSnap.transfers.map((transfer) => (
						<p key={transfer.fileName} className="text-sm text-ink-600">
							{transfer.fileName} ({transfer.received}/{transfer.total})
						</p>
					))}
				</Block>
			)}
			{syncSnap.receivedFiles.length > 0 && (
				<>
					<Block className="px-4">
						<h2 className="text-sm font-medium text-ink-600">Received files</h2>
					</Block>
					<List className="pb-safe-or-8">
						{syncSnap.receivedFiles.map((file) => (
							<ListItem key={file.fileId} title={file.name} asChild>
								<RouterLink to={`/play?id=${file.fileId}`} />
							</ListItem>
						))}
					</List>
				</>
			)}
		</>
	)
}

export default SyncPage
