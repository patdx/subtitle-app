import { observer } from 'mobx-react-lite'
import { Link as RouterLink, useNavigate } from 'react-router'
import {
	Block,
	Button,
	List,
	ListItem,
	Navbar,
	NavbarBackLink,
	Page,
} from '~/components'
import { QrCode } from '~/shared/qr'
import { QrScanner } from '~/shared/qr-scanner'
import { syncStore } from '~/shared/sync'
import type { Route } from './+types/sync'

export function meta({}: Route.MetaArgs) {
	return [{ title: 'Sync - Subtitle App' }]
}

const SyncPage = observer(() => {
	const navigate = useNavigate()
	const [codeInput, setCodeInput] = useState('')
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		const codeParam = new URL(location.href).searchParams.get('code')
		void (async () => {
			await syncStore.init()
			if (codeParam) window.history.replaceState(null, '', location.pathname)
			if (codeParam && codeParam.toUpperCase() !== syncStore.myGroupCode) {
				setCodeInput(
					codeParam
						.toUpperCase()
						.replace(/[^A-Z0-9]/g, '')
						.slice(0, 20),
				)
				await join(codeParam)
			} else {
				await syncStore.restore()
			}
		})()
	}, [])

	const connecting = syncStore.connectionState === 'connecting'
	const connected = syncStore.connectionState === 'connected'
	const active = syncStore.role === 'peer'
	const qrValue = syncStore.roomCode
		? `${location.origin}/sync?code=${syncStore.roomCode}`
		: ''

	async function join(codeOverride?: string) {
		const code = (codeOverride ?? codeInput).trim()
		if (code.length !== 20) return
		setBusy(true)
		try {
			await syncStore.joinGroup(code)
		} finally {
			setBusy(false)
		}
	}

	async function retry() {
		if (syncStore.joinedGroupCode) {
			await syncStore.joinGroup(syncStore.joinedGroupCode)
		} else {
			await syncStore.startSharing()
		}
	}

	return (
		<Page>
			<Navbar
				title="Sync"
				left={
					<NavbarBackLink onClick={() => navigate(-1)}>Back</NavbarBackLink>
				}
			/>

			<Block className="px-4 pb-2">
				<p className="max-w-prose text-sm text-ink-500">
					Pair your own devices and control playback together.
				</p>
			</Block>

			<Block className="px-4">
				<label className="flex items-center gap-2 text-sm">
					<span className="text-ink-500">Device name</span>
					<input
						value={syncStore.deviceName}
						onChange={(e) => {
							void syncStore.setDeviceName(e.target.value)
						}}
						className="flex-1 rounded-field border border-edge bg-paper-raised px-3 py-1.5 text-base text-ink-900 placeholder:text-ink-400 focus:border-ember-600 focus:outline-none focus:ring-2 focus:ring-ember-600/30 sm:text-sm"
						maxLength={24}
					/>
				</label>
			</Block>

			{/* ---------------------------------------------------------- */}
			{/* Status + own group                                          */}
			{/* ---------------------------------------------------------- */}
			<Block className="px-4">
				{syncStore.error && (
					<p className="mb-3 text-sm text-danger">{syncStore.error}</p>
				)}

				<div className="flex items-center justify-between">
					<span
						className={cn(
							'flex items-center gap-2 text-sm font-medium',
							connected
								? 'text-ok'
								: syncStore.connectionState === 'error'
									? 'text-danger'
									: 'text-ink-600',
						)}
					>
						<span
							className={cn(
								'h-2.5 w-2.5 rounded-full',
								connected
									? 'bg-ok'
									: syncStore.connectionState === 'error'
										? 'bg-danger'
										: syncStore.isRestoring || connecting
											? 'bg-warn'
											: 'bg-ink-300',
							)}
						/>
						{syncStore.isRestoring || connecting
							? 'Connecting…'
							: connected
								? `Connected to group ${syncStore.roomCode ?? ''}`
								: syncStore.connectionState === 'error'
									? 'Not connected'
									: 'Not sharing'}
					</span>
					{syncStore.connectionState === 'error' && active === false && (
						<Button variant="secondary" onClick={() => void retry()} disabled={busy}>
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
								{syncStore.roomCode}
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
								>
									Copy link
								</Button>
								<Button
									variant="danger"
									onClick={() => {
										void (syncStore.joinedGroupCode
											? syncStore.leaveGroup()
											: syncStore.stopSharing())
									}}
								>
									Disconnect
								</Button>
								<Button
									variant="text"
									onClick={() => void syncStore.createNewGroup()}
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
							{syncStore.myGroupCode ? (
								<p className="mt-2 font-mono text-2xl font-bold tracking-[0.3em] text-ink-900">
									{syncStore.myGroupCode}
								</p>
							) : (
								<p className="mt-1 text-sm text-ink-500">
									You'll get a permanent code when you start pairing.
								</p>
							)}
							<Button
								className="mt-4 w-full"
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
					<Block className="flex flex-col gap-3 px-4">
						<input
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
							className="w-full rounded-field border border-edge bg-paper-raised px-3 py-2 text-center font-mono text-xl tracking-widest text-ink-900 placeholder:text-ink-400 focus:border-ember-600 focus:outline-none focus:ring-2 focus:ring-ember-600/30"
							maxLength={20}
							autoCapitalize="characters"
							autoCorrect="off"
							spellCheck={false}
						/>
						<Button
							onClick={() => void join()}
							disabled={busy || connecting || codeInput.trim().length !== 20}
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
})

const MembersList = observer(() => {
	if (syncStore.roomPeers.length === 0) return null
	return (
		<>
			<Block className="px-4">
				<h2 className="text-sm font-medium text-ink-600">Connected devices</h2>
			</Block>
			<List>
				{syncStore.roomPeers.map((peer) => (
					<ListItem
						key={peer.sessionId}
						title={peer.name}
						after={
							<span className="text-xs text-ink-400">Device</span>
						}
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
})

const ReceivedFilesList = observer(() => {
	if (
		syncStore.transfers.length === 0 &&
		syncStore.receivedFiles.length === 0
	) {
		return null
	}
	return (
		<>
			{syncStore.transfers.length > 0 && (
				<Block className="px-4">
					<p className="text-sm font-medium">Receiving files…</p>
					{syncStore.transfers.map((transfer) => (
						<p key={transfer.fileName} className="text-sm text-ink-600">
							{transfer.fileName} ({transfer.received}/{transfer.total})
						</p>
					))}
				</Block>
			)}
			{syncStore.receivedFiles.length > 0 && (
				<>
					<Block className="px-4">
						<h2 className="text-sm font-medium text-ink-600">
							Received files
						</h2>
					</Block>
					<List>
						{syncStore.receivedFiles.map((file) => (
							<ListItem key={file.fileId} title={file.name} asChild>
								<RouterLink to={`/play?id=${file.fileId}`} />
							</ListItem>
						))}
					</List>
				</>
			)}
		</>
	)
})

export default SyncPage
