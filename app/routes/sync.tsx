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
			if (codeParam && codeParam.toUpperCase() !== syncStore.myGroupCode) {
				setCodeInput(
					codeParam
						.toUpperCase()
						.replace(/[^A-Z0-9]/g, '')
						.slice(0, 10),
				)
				await join(codeParam)
			} else {
				await syncStore.restore()
			}
		})()
	}, [])

	const connecting = syncStore.connectionState === 'connecting'
	const connected = syncStore.connectionState === 'connected'
	const isOwner = syncStore.role === 'host'
	const isMember = syncStore.role === 'follower'
	const active = isOwner || isMember
	const qrValue = syncStore.roomCode
		? `${location.origin}/sync?code=${syncStore.roomCode}`
		: ''

	async function join(codeOverride?: string) {
		const code = (codeOverride ?? codeInput).trim()
		if (code.length !== 10) return
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

			<Block className="px-4">
				<p className="max-w-prose text-sm text-gray-600">
					Connect your own devices. Place a tablet below the TV and control it
					from your phone. Play, pause and seek on one device control the
					others. Subtitles transfer directly between devices. Nothing is stored
					on a server, and both devices need to be online.
				</p>
			</Block>

			<Block className="px-4">
				<label className="flex items-center gap-2 text-sm">
					<span className="text-gray-600">Device name</span>
					<input
						value={syncStore.deviceName}
						onChange={(e) => {
							void syncStore.setDeviceName(e.target.value)
						}}
						className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-base sm:text-sm"
						maxLength={24}
					/>
				</label>
			</Block>

			{/* ---------------------------------------------------------- */}
			{/* Status + own group                                          */}
			{/* ---------------------------------------------------------- */}
			<Block className="px-4">
				{syncStore.error && (
					<p className="mb-3 text-sm text-red-600">{syncStore.error}</p>
				)}

				<div className="flex items-center justify-between">
					<span
						className={cn(
							'flex items-center gap-2 text-sm font-medium',
							connected
								? 'text-green-600'
								: syncStore.connectionState === 'error'
									? 'text-red-600'
									: 'text-gray-600',
						)}
					>
						<span
							className={cn(
								'h-2.5 w-2.5 rounded-full',
								connected
									? 'bg-green-500'
									: syncStore.connectionState === 'error'
										? 'bg-red-500'
										: syncStore.isRestoring || connecting
											? 'bg-yellow-500'
											: 'bg-gray-300',
							)}
						/>
						{syncStore.isRestoring || connecting
							? 'Connecting…'
							: connected
								? isOwner
									? 'Sharing this device'
									: `Connected to device ${syncStore.roomCode ?? ''}`
								: syncStore.connectionState === 'error'
									? 'Not connected'
									: 'Not sharing'}
					</span>
					{syncStore.connectionState === 'error' && active === false && (
						<Button onClick={() => void retry()} disabled={busy}>
							Retry
						</Button>
					)}
				</div>
			</Block>

			{/* ---------------------------------------------------------- */}
			{/* Owner: code + QR + members                                   */}
			{/* ---------------------------------------------------------- */}
			{isOwner && (
				<>
					<Block className="px-4">
						<div className="text-center">
							<p className="text-sm text-gray-600">This device's code</p>
							<p className="font-mono text-4xl font-bold tracking-[0.4em]">
								{syncStore.roomCode}
							</p>
							<div className="mx-auto mt-3 w-48 bg-white p-2">
								<QrCode value={qrValue} size={176} />
							</div>
							<p className="mt-2 text-xs text-gray-500">
								Scan this from your other device to connect it.
							</p>
							<Button
								className="mt-3"
								onClick={() => {
									void navigator.clipboard?.writeText(qrValue).catch(() => {})
								}}
							>
								Copy link
							</Button>
						</div>
					</Block>

					<MembersList />
				</>
			)}

			{/* ---------------------------------------------------------- */}
			{/* Member: group info + leave                                   */}
			{/* ---------------------------------------------------------- */}
			{isMember && (
				<>
					<Block className="px-4">
						<div className="text-center">
							<p className="text-sm text-gray-600">
								Connected to device{' '}
								<span className="font-mono font-semibold">
									{syncStore.roomCode}
								</span>
							</p>
							<p className="mt-1 text-xs text-gray-500">
								You can control it from here.
							</p>
							<Button
								className="mt-3"
								onClick={() => {
									void syncStore.leaveGroup()
								}}
							>
								Disconnect
							</Button>
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
						<div className="rounded-lg border border-gray-200 p-4 text-center">
							<p className="text-sm font-medium">This device</p>
							{syncStore.myGroupCode ? (
								<p className="mt-1 font-mono text-2xl font-bold tracking-[0.3em] text-gray-700">
									{syncStore.myGroupCode}
								</p>
							) : (
								<p className="mt-1 text-sm text-gray-500">
									You'll get a permanent code when you start pairing.
								</p>
							)}
							<Button
								className="mt-3 w-full"
								onClick={() => void syncStore.startSharing()}
								disabled={busy || connecting}
							>
								{busy || connecting ? 'Connecting…' : 'Start pairing'}
							</Button>
							<p className="mt-2 text-xs text-gray-500">
								Scan this code from your other device (phone, tablet, TV box) to
								connect it.
							</p>
						</div>
					</Block>

					<Block className="px-4">
						<h2 className="text-sm font-medium text-gray-600">
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
										.slice(0, 10),
								)
							}
							placeholder="Enter the code shown on the other device"
							className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center font-mono text-xl tracking-widest"
							maxLength={6}
							autoCapitalize="characters"
							autoCorrect="off"
							spellCheck={false}
						/>
						<Button
							onClick={() => void join()}
							disabled={busy || connecting || codeInput.trim().length !== 10}
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
				<h2 className="text-sm font-medium text-gray-600">Connected devices</h2>
			</Block>
			<List className="list-strong-ios list-outline-ios">
				{syncStore.roomPeers.map((peer) => (
					<ListItem
						key={peer.sessionId}
						title={peer.name}
						after={peer.isHost ? 'Host' : 'Device'}
						footer={
							<span
								className={cn(
									'text-xs',
									peer.connected ? 'text-green-600' : 'text-gray-400',
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
						<p key={transfer.fileName} className="text-sm text-gray-600">
							{transfer.fileName} ({transfer.received}/{transfer.total})
						</p>
					))}
				</Block>
			)}
			{syncStore.receivedFiles.length > 0 && (
				<>
					<Block className="px-4">
						<h2 className="text-sm font-medium text-gray-600">
							Received files
						</h2>
					</Block>
					<List className="list-strong-ios list-outline-ios">
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
