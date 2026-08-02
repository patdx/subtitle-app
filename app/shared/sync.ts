import { proxy } from 'valtio'
import { nanoid } from 'nanoid'
import {
	addFileToDatabase,
	clock,
	getFile,
	getTimeElapsed,
	initAndGetDb,
	setClock,
	setSetting,
	getSetting,
	toggleIsPlaying,
	type DbLine,
} from './utils'

/**
 * Multi-device sync over direct, bidirectional WebRTC data channels.
 * A hibernatable Durable Object relays only temporary SDP/ICE signaling;
 * No relay is configured: peers must establish a direct connection.
 *
 * Device pairing creates a remembered group. Every online member connects
 * directly to every other member, and an internal coordinator is elected
 * automatically. There are no user-facing host/client roles.
 *
 * Topology is hub-and-spoke, with one full-duplex data channel per pair.
 */

const API = '/api/sync'
const DC_NAME = 'subtitles'
const CHUNK_SIZE = 32 * 1024
const MAX_DATA_MESSAGE_CHARS = 64 * 1024
const BROADCAST_INTERVAL_MS = 100
const PING_INTERVAL_MS = 5000
const CONNECT_TIMEOUT_MS = 15000
const MAX_PRESENCE_RECONNECT_ATTEMPTS = 6
const MAX_CONCURRENT_TRANSFERS = 4
const MAX_TRANSFER_CHUNKS = 1024
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export type SyncRole = 'none' | 'peer'
export type ConnectionState =
	'disconnected' | 'connecting' | 'connected' | 'error'

export interface PeerInfo {
	sessionId: string
	name: string
	connected: boolean
}

export interface ReceivedFile {
	fileId: string
	name: string
}

type SignalMessage =
	| { type: 'peers'; peers: { id: string; name: string }[] }
	| {
			type: 'offer' | 'answer'
			from: string
			generation: string
			sdp: RTCSessionDescriptionInit
	  }
	| {
			type: 'ice'
			from: string
			generation: string
			candidates: RTCIceCandidateInit[]
	  }

interface PeerTransport {
	pc: RTCPeerConnection
	generation: string
	pendingIce: RTCIceCandidateInit[]
}

export type SyncMessage =
	| { type: 'cmd-play' }
	| { type: 'cmd-pause' }
	| { type: 'cmd-seek'; positionMs: number }
	| { type: 'cmd-speed'; speed: number }
	| { type: 'claim-coordinator'; term: number; claimantId: string }
	| {
			type: 'state-clock'
			isPlaying: boolean
			positionMs: number
			playSpeed: number
	  }
	| { type: 'join'; deviceName: string }
	| { type: 'leave'; deviceName: string }
	| { type: 'now-playing'; fileId: string; name: string }
	| { type: 'file-list'; files: { id: string; name: string }[] }
	| { type: 'request-file'; fileName: string }
	| {
			type: 'file-chunk'
			transferId: string
			chunkIndex: number
			totalChunks: number
			fileName: string
			data: string
	  }
	| { type: 'ping'; sentAt: number }
	| { type: 'pong'; sentAt: number }

const makeRoomCode = (): string => {
	const chars = new Uint8Array(20)
	crypto.getRandomValues(chars)
	let code = ''
	for (const c of chars) {
		code += ROOM_CODE_ALPHABET[c % ROOM_CODE_ALPHABET.length]
	}
	return code
}

const formatTimestamp = (ms: number): string => {
	const pad = (n: number, width = 2) => String(n).padStart(width, '0')
	const hours = Math.floor(ms / 3_600_000)
	const minutes = Math.floor((ms % 3_600_000) / 60_000)
	const seconds = Math.floor((ms % 60_000) / 1000)
	const millis = ms % 1000
	return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`
}

/** Raw SRT text is not stored, only parsed lines; rebuild it for transfer. */
export const linesToSrtText = (lines: DbLine[]): string =>
	lines
		.map(
			(line, index) =>
				`${index + 1}\n${formatTimestamp(line.from)} --> ${formatTimestamp(line.to)}\n${line.text}\n`,
		)
		.join('\n')

export interface SyncState {
	role: SyncRole
	sessionId: string | null
	roomCode: string | null
	connectionState: ConnectionState
	error: string | null
	deviceName: string
	roomPeers: PeerInfo[]
	coordinationClaim: { term: number; claimantId: string } | null
	receivedFiles: ReceivedFile[]
	transfers: { fileName: string; received: number; total: number }[]
	pendingNowPlaying: ReceivedFile | null
	myGroupCode: string | null
	/** group code we joined (null = our own group) */
	joinedGroupCode: string | null
	/** whether our own group was active when we last left */
	wasSharing: boolean
	/** true while restoring a previously active group */
	isRestoring: boolean
}

export const syncState = proxy<SyncState>({
	role: 'none',
	sessionId: null,
	roomCode: null,
	connectionState: 'disconnected',
	error: null,
	deviceName: `Device ${Math.floor(Math.random() * 1000)}`,
	roomPeers: [],
	coordinationClaim: null,
	receivedFiles: [],
	transfers: [],
	pendingNowPlaying: null,
	myGroupCode: null,
	joinedGroupCode: null,
	wasSharing: false,
	isRestoring: false,
})

export const getCoordinatorId = (state: {
	sessionId: string | null
	roomPeers: readonly PeerInfo[]
	coordinationClaim: { term: number; claimantId: string } | null
}): string | null => {
	if (!state.sessionId) return null
	const online = [
		state.sessionId,
		...state.roomPeers.map((peer) => peer.sessionId),
	]
	if (
		state.coordinationClaim &&
		online.includes(state.coordinationClaim.claimantId)
	)
		return state.coordinationClaim.claimantId
	return online.sort()[0]
}

class SyncEngine {
	/** non-observable WebRTC state */
	pc: RTCPeerConnection | null = null
	peerTransports = new Map<string, PeerTransport>()
	earlyIce = new Map<
		string,
		{ generation: string; candidates: RTCIceCandidateInit[] }
	>()
	inboundDcs: Map<string, RTCDataChannel> = new Map()
	presenceSocket: WebSocket | null = null
	presenceReconnectTimer: number | null = null
	presenceReconnectAttempts = 0
	presenceIntentionalClose = false
	broadcastTimer: number | null = null
	pingTimer: number | null = null
	connectTimeout: number | null = null
	receiveBuffers = new Map<
		string,
		{
			fileName: string
			total: number
			chunks: (string | null)[]
			timeout: number
		}
	>()
	pendingNowPlayingRequests = new Map<string, { name: string }>()
	lastFileRequestAt = new Map<string, number>()
	peerReconnectAttempts = new Map<string, number>()

	/** true while the next file announcement is swallowed (internal only) */
	suppressNextFileAnnouncement = false

	get coordinatorId(): string | null {
		return getCoordinatorId(syncState)
	}

	get isCoordinator(): boolean {
		return (
			syncState.role === 'peer' && this.coordinatorId === syncState.sessionId
		)
	}

	// ------------------------------------------------------------------
	// Persistent group identity
	// ------------------------------------------------------------------

	async init() {
		syncState.myGroupCode = (await getSetting<string>('myGroupCode')) ?? null
		syncState.joinedGroupCode =
			(await getSetting<string>('joinedGroupCode')) ?? null
		syncState.wasSharing = (await getSetting<boolean>('wasSharing')) ?? false
		const deviceName = await getSetting<string>('deviceName')
		if (typeof deviceName === 'string' && deviceName.length > 0) {
			syncState.deviceName = deviceName
		} else {
			await setSetting('deviceName', syncState.deviceName)
		}
	}

	/** Bring back the previously active group when opening the app. */
	async restore() {
		await this.init()
		if (syncState.connectionState !== 'disconnected') return
		syncState.isRestoring = true
		try {
			if (syncState.joinedGroupCode) {
				await this.joinGroup(syncState.joinedGroupCode)
			} else if (syncState.wasSharing) {
				await this.startSharing()
			}
		} finally {
			syncState.isRestoring = false
		}
	}

	private async ensureMyGroup(): Promise<string> {
		if (!syncState.myGroupCode || syncState.myGroupCode.length !== 20) {
			syncState.myGroupCode = makeRoomCode()
			await setSetting('myGroupCode', syncState.myGroupCode)
		}
		return syncState.myGroupCode
	}

	async setDeviceName(name: string) {
		syncState.deviceName = name
		await setSetting('deviceName', name)
	}

	/** Share our own group; showing the QR implicitly starts it. */
	async startSharing() {
		const code = await this.ensureMyGroup()
		await this.connectGroup(code)
		if (
			syncState.role === 'peer' &&
			syncState.connectionState === 'connected'
		) {
			syncState.joinedGroupCode = null
			syncState.wasSharing = true
			await setSetting('joinedGroupCode', null)
			await setSetting('wasSharing', true)
		}
	}

	/** Join someone else's group. */
	async joinGroup(code: string) {
		await this.connectGroup(code)
		if (
			syncState.role === 'peer' &&
			syncState.connectionState === 'connected'
		) {
			syncState.joinedGroupCode = syncState.roomCode
			syncState.wasSharing = false
			await setSetting('joinedGroupCode', syncState.roomCode)
			await setSetting('wasSharing', false)
		}
	}

	/** Stop sharing our group (the group code is kept for later). */
	async stopSharing() {
		this.send({ type: 'leave', deviceName: syncState.deviceName })
		this.reset()
		syncState.wasSharing = false
		await setSetting('wasSharing', false)
	}

	/** Leave a group we joined and go back to our own group. */
	async leaveGroup() {
		this.send({ type: 'leave', deviceName: syncState.deviceName })
		this.reset()
		syncState.joinedGroupCode = null
		await setSetting('joinedGroupCode', null)
	}

	/** Rotate the bearer group capability and start a fresh remembered group. */
	async createNewGroup() {
		this.reset()
		syncState.myGroupCode = makeRoomCode()
		syncState.joinedGroupCode = null
		syncState.wasSharing = true
		await setSetting('myGroupCode', syncState.myGroupCode)
		await setSetting('joinedGroupCode', null)
		await setSetting('wasSharing', true)
		await this.connectGroup(syncState.myGroupCode)
	}

	reconnect() {
		if (syncState.role === 'peer' && syncState.roomCode)
			void this.connectGroup(syncState.roomCode)
	}

	/** Consume the announced now-playing file (cleared after opening it). */
	consumePendingNowPlaying() {
		syncState.pendingNowPlaying = null
		this.suppressNextFileAnnouncement = true
	}

	send(msg: SyncMessage) {
		const raw = JSON.stringify(msg)
		for (const dc of this.inboundDcs.values()) {
			if (dc.readyState === 'open') dc.send(raw)
		}
	}

	private async _sendWithBackpressure(msg: SyncMessage) {
		const raw = JSON.stringify(msg)
		for (const dc of this.inboundDcs.values()) {
			if (dc.readyState !== 'open') continue
			if (dc.bufferedAmount > 512 * 1024) {
				dc.bufferedAmountLowThreshold = 256 * 1024
				await new Promise<void>((resolve) => {
					const done = () => {
						window.clearTimeout(timeout)
						dc.removeEventListener('bufferedamountlow', done)
						resolve()
					}
					const timeout = window.setTimeout(done, 2000)
					dc.addEventListener('bufferedamountlow', done, { once: true })
				})
			}
			if (dc.readyState === 'open' && dc.bufferedAmount <= 512 * 1024)
				dc.send(raw)
		}
	}

	// ------------------------------------------------------------------
	// Connection setup
	// ------------------------------------------------------------------

	private async connectGroup(code: string) {
		this.reset()
		syncState.connectionState = 'connecting'
		syncState.role = 'peer'

		try {
			syncState.sessionId = makeConnectionId()
			syncState.roomCode = code.toUpperCase()
			this._startConnectTimeout()
			await this._connectPresence()
			this._startBroadcastTimer()
			this._startPing()

			syncState.connectionState = 'connected'
			this._clearConnectTimeout()
			void this.onFileLoaded()
		} catch (err) {
			this._fail(
				err,
				'Could not reach this group. Check the code and network, then try again.',
			)
		}
	}

	// ------------------------------------------------------------------
	// Clock helpers (used by the controls UI)
	// ------------------------------------------------------------------

	seekBy(deltaMs: number) {
		this.seekTo(getTimeElapsed() + deltaMs)
	}

	seekTo(positionMs: number) {
		setClock({ lastActionAt: Date.now(), lastTimeElapsedMs: positionMs })
		if (this.isCoordinator) {
			this.broadcastClockState()
		} else if (syncState.role !== 'none') {
			this.send({ type: 'cmd-seek', positionMs: getTimeElapsed() })
		}
	}

	togglePlayback() {
		const isPlaying = !clock.isPlaying
		toggleIsPlaying(isPlaying)
		if (this.isCoordinator) {
			this.broadcastClockState()
		} else if (syncState.role !== 'none') {
			this.send({ type: isPlaying ? 'cmd-play' : 'cmd-pause' })
		}
	}

	setPlaySpeed(speed: number) {
		setClock({
			playSpeed: speed,
			lastActionAt: Date.now(),
			lastTimeElapsedMs: getTimeElapsed(),
		})
		if (this.isCoordinator) {
			this.broadcastClockState()
		} else if (syncState.role !== 'none') {
			this.send({ type: 'cmd-speed', speed })
		}
	}

	// ------------------------------------------------------------------
	// Coordinator broadcasts
	// ------------------------------------------------------------------

	async onFileLoaded() {
		if (this.suppressNextFileAnnouncement) {
			this.suppressNextFileAnnouncement = false
			return
		}
		if (syncState.role !== 'peer' || !syncState.sessionId) return
		if (!this.isCoordinator) {
			const claim = {
				term: (syncState.coordinationClaim?.term ?? 0) + 1,
				claimantId: syncState.sessionId,
			}
			syncState.coordinationClaim = claim
			this.send({ type: 'claim-coordinator', ...claim })
		}
		await this.broadcastNowPlaying()
		await this.broadcastFileList()
	}

	async broadcastNowPlaying() {
		if (!this.isCoordinator) return
		const lines = getFile()
		const fileId = lines?.[0]?.fileId
		if (!fileId) return
		const db = await initAndGetDb()
		const file = await db.get('files', fileId)
		this.send({ type: 'now-playing', fileId, name: file?.name ?? 'Subtitle' })
	}

	async broadcastFileList() {
		if (!this.isCoordinator) return
		const db = await initAndGetDb()
		const files = await db.getAll('files')
		this.send({
			type: 'file-list',
			files: files
				.slice(0, 256)
				.map((file) => ({ id: file.id, name: file.name.slice(0, 256) })),
		})
	}

	async sendFile(fileName: string) {
		if (!this.isCoordinator) return
		const db = await initAndGetDb()
		const file = (await db.getAll('files')).find((f) => f.name === fileName)
		if (!file) return
		const lines = await db.getAllFromIndex('lines', 'by-file-id', file.id)
		lines.sort((a, b) => a.from - b.from)
		if (lines.length === 0) return

		const text = linesToSrtText(lines)
		const transferId = nanoid()
		const totalChunks = Math.max(1, Math.ceil(text.length / CHUNK_SIZE))
		if (totalChunks > MAX_TRANSFER_CHUNKS) {
			syncState.error = 'This subtitle file is too large to sync directly'
			return
		}

		for (let i = 0; i < totalChunks; i++) {
			await this._sendWithBackpressure({
				type: 'file-chunk',
				transferId,
				chunkIndex: i,
				totalChunks,
				fileName,
				data: text.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
			})
		}
	}

	sendFileDeleted(fileId: string, fileName: string) {
		// Deletion stays local. A group peer must never be able to delete another
		// device's IndexedDB content, even when it is the current coordinator.
		void fileId
		void fileName
	}

	broadcastClockState() {
		if (!this.isCoordinator || syncState.connectionState !== 'connected') return
		this.send({
			type: 'state-clock',
			isPlaying: clock.isPlaying,
			positionMs: getTimeElapsed(),
			playSpeed: clock.playSpeed,
		})
	}

	// ------------------------------------------------------------------
	// Incoming messages
	// ------------------------------------------------------------------

	private _handleMessage(value: unknown, peerId: string) {
		if (!value || typeof value !== 'object' || Array.isArray(value)) return
		const msg = value as SyncMessage
		if (msg.type === 'claim-coordinator') {
			if (
				msg.claimantId !== peerId ||
				!Number.isSafeInteger(msg.term) ||
				msg.term < 1 ||
				msg.term > 1_000_000_000
			)
				return
			const current = syncState.coordinationClaim
			if (
				!current ||
				msg.term > current.term ||
				(msg.term === current.term && msg.claimantId > current.claimantId)
			)
				syncState.coordinationClaim = {
					term: msg.term,
					claimantId: msg.claimantId,
				}
			return
		}
		const fromCoordinator = peerId === this.coordinatorId
		const allowed = this.isCoordinator
			? new Set([
					'cmd-play',
					'cmd-pause',
					'cmd-seek',
					'cmd-speed',
					'join',
					'leave',
					'request-file',
					'ping',
					'pong',
				])
			: fromCoordinator
				? new Set([
						'state-clock',
						'now-playing',
						'file-list',
						'file-chunk',
						'ping',
						'pong',
					])
				: new Set(['ping', 'pong'])
		if (!allowed.has(msg.type)) return
		switch (msg.type) {
			case 'state-clock':
				if (
					typeof msg.isPlaying !== 'boolean' ||
					!Number.isFinite(msg.positionMs) ||
					msg.positionMs < 0 ||
					!Number.isFinite(msg.playSpeed) ||
					msg.playSpeed < 0.1 ||
					msg.playSpeed > 5
				)
					return
				this._applyClockState(msg)
				return
			case 'now-playing':
				if (typeof msg.name !== 'string' || msg.name.length > 256) return
				void this._handleNowPlaying(msg).catch((err) =>
					console.error('now-playing handler failed', err),
				)
				return
			case 'file-list':
				if (
					!Array.isArray(msg.files) ||
					msg.files.length > 256 ||
					msg.files.some(
						(file) =>
							!file ||
							typeof file.id !== 'string' ||
							typeof file.name !== 'string' ||
							file.name.length > 256,
					)
				)
					return
				void this._handleFileList(msg).catch((err) =>
					console.error('file-list handler failed', err),
				)
				return
			case 'file-chunk':
				this._handleFileChunk(msg)
				return
			case 'ping':
				this.send({ type: 'pong', sentAt: msg.sentAt })
				return
		}

		if (!this.isCoordinator) return

		switch (msg.type) {
			case 'cmd-play':
				if (!clock.isPlaying) {
					toggleIsPlaying(true)
					this.broadcastClockState()
				}
				return
			case 'cmd-pause':
				if (clock.isPlaying) {
					toggleIsPlaying(false)
					this.broadcastClockState()
				}
				return
			case 'cmd-seek':
				if (!Number.isFinite(msg.positionMs) || msg.positionMs < 0) return
				setClock({
					lastActionAt: Date.now(),
					lastTimeElapsedMs: msg.positionMs,
				})
				this.broadcastClockState()
				return
			case 'cmd-speed':
				if (!Number.isFinite(msg.speed) || msg.speed < 0.1 || msg.speed > 5)
					return
				setClock({
					playSpeed: msg.speed,
					lastActionAt: Date.now(),
					lastTimeElapsedMs: getTimeElapsed(),
				})
				this.broadcastClockState()
				return
			case 'join':
				void this._handlePeerJoin()
				return
			case 'leave':
				this._handlePeerLeave(msg.deviceName)
				return
			case 'request-file':
				if (typeof msg.fileName !== 'string' || msg.fileName.length > 256)
					return
				if (Date.now() - (this.lastFileRequestAt.get(peerId) ?? 0) < 2000)
					return
				this.lastFileRequestAt.set(peerId, Date.now())
				void this.sendFile(msg.fileName)
				return
		}
	}

	private _applyClockState(msg: Extract<SyncMessage, { type: 'state-clock' }>) {
		setClock({ lastActionAt: Date.now(), lastTimeElapsedMs: msg.positionMs })
		toggleIsPlaying(msg.isPlaying)
		setClock({
			playSpeed: msg.playSpeed,
			lastActionAt: Date.now(),
			lastTimeElapsedMs: getTimeElapsed(),
		})
	}

	private async _handlePeerJoin() {
		// Push current state so a newly joined device catches up.
		await this.broadcastNowPlaying()
		await this.broadcastFileList()
	}

	private _handlePeerLeave(deviceName: string) {
		syncState.roomPeers = syncState.roomPeers.map((peer) =>
			peer.name === deviceName ? { ...peer, connected: false } : peer,
		)
	}

	private async _handleNowPlaying(
		msg: Extract<SyncMessage, { type: 'now-playing' }>,
	) {
		const db = await initAndGetDb()
		const existing = (await db.getAll('files')).find((f) => f.name === msg.name)
		if (existing) {
			syncState.pendingNowPlaying = { fileId: existing.id, name: msg.name }
			return
		}
		this.pendingNowPlayingRequests.set(msg.name, msg)
		this.send({ type: 'request-file', fileName: msg.name })
	}

	private async _handleFileList(
		msg: Extract<SyncMessage, { type: 'file-list' }>,
	) {
		const db = await initAndGetDb()
		const localNames = new Set((await db.getAll('files')).map((f) => f.name))
		for (const file of msg.files) {
			if (!localNames.has(file.name)) {
				this.send({ type: 'request-file', fileName: file.name })
			}
		}
	}

	private _handleFileChunk(msg: Extract<SyncMessage, { type: 'file-chunk' }>) {
		if (
			typeof msg.transferId !== 'string' ||
			msg.transferId.length > 128 ||
			typeof msg.fileName !== 'string' ||
			msg.fileName.length > 256 ||
			!Number.isInteger(msg.totalChunks) ||
			msg.totalChunks < 1 ||
			msg.totalChunks > MAX_TRANSFER_CHUNKS ||
			!Number.isInteger(msg.chunkIndex) ||
			msg.chunkIndex < 0 ||
			msg.chunkIndex >= msg.totalChunks ||
			typeof msg.data !== 'string' ||
			msg.data.length > CHUNK_SIZE
		)
			return
		let buffer = this.receiveBuffers.get(msg.transferId)
		if (!buffer) {
			if (this.receiveBuffers.size >= MAX_CONCURRENT_TRANSFERS) return
			buffer = {
				fileName: msg.fileName,
				total: msg.totalChunks,
				chunks: new Array<string | null>(msg.totalChunks).fill(null),
				timeout: window.setTimeout(() => {
					this.receiveBuffers.delete(msg.transferId)
					this._updateTransfers()
				}, 60_000),
			}
			this.receiveBuffers.set(msg.transferId, buffer)
		}
		if (buffer.total !== msg.totalChunks || buffer.fileName !== msg.fileName)
			return
		buffer.chunks[msg.chunkIndex] = msg.data
		this._updateTransfers()

		if (buffer.chunks.every((chunk) => chunk !== null)) {
			window.clearTimeout(buffer.timeout)
			this.receiveBuffers.delete(msg.transferId)
			this._updateTransfers()
			const text = (buffer.chunks as string[]).join('')
			void this._importReceivedFile(buffer.fileName, text)
		}
	}

	private _updateTransfers() {
		syncState.transfers = [...this.receiveBuffers.values()].map((buffer) => ({
			fileName: buffer.fileName,
			received: buffer.chunks.filter((chunk) => chunk !== null).length,
			total: buffer.total,
		}))
	}

	private async _importReceivedFile(fileName: string, text: string) {
		if (syncState.receivedFiles.some((file) => file.name === fileName)) return
		try {
			const fileId = await addFileToDatabase(text, fileName)
			syncState.receivedFiles = [
				...syncState.receivedFiles,
				{ fileId, name: fileName },
			]
			const pending = this.pendingNowPlayingRequests.get(fileName)
			if (pending) {
				this.pendingNowPlayingRequests.delete(fileName)
				syncState.pendingNowPlaying = { fileId, name: fileName }
			}
		} catch (err) {
			console.error('Failed to import received file', err)
		}
	}

	// ------------------------------------------------------------------
	// WebRTC plumbing
	// ------------------------------------------------------------------

	private _monitorConnection(pc: RTCPeerConnection, peerId: string) {
		pc.onconnectionstatechange = () => {
			if (pc.connectionState === 'connected') {
				this.peerReconnectAttempts.set(peerId, 0)
				syncState.connectionState = 'connected'
				this.presenceReconnectAttempts = 0
				this._clearConnectTimeout()
				if (syncState.sessionId && syncState.sessionId > peerId)
					this._sendSignal({
						type: 'ready',
						to: peerId,
						generation:
							this.peerTransports.get(peerId)?.generation ?? makeConnectionId(),
					})
			}
			if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
				const transport = this.peerTransports.get(peerId)
				if (transport?.pc === pc) this.peerTransports.delete(peerId)
				syncState.roomPeers = syncState.roomPeers.map((peer) =>
					peer.sessionId === peerId ? { ...peer, connected: false } : peer,
				)
				const retries = this.peerReconnectAttempts.get(peerId) ?? 0
				if (
					retries < 3 &&
					!this.presenceIntentionalClose &&
					syncState.roomCode
				) {
					this.peerReconnectAttempts.set(peerId, retries + 1)
					this._schedulePresenceReconnect()
				}
			}
		}
	}

	private _attachDataChannel(dc: RTCDataChannel, peerId: string) {
		dc.onmessage = (event) => {
			try {
				if (
					typeof event.data !== 'string' ||
					event.data.length > MAX_DATA_MESSAGE_CHARS
				)
					return
				this._handleMessage(JSON.parse(event.data), peerId)
			} catch (err) {
				console.warn('Ignoring malformed sync message', err)
			}
		}
		dc.onopen = () => {
			this.inboundDcs.set(peerId, dc)
			syncState.roomPeers = syncState.roomPeers.map((peer) =>
				peer.sessionId === peerId ? { ...peer, connected: true } : peer,
			)
			if (syncState.coordinationClaim?.claimantId === syncState.sessionId)
				dc.send(
					JSON.stringify({
						type: 'claim-coordinator',
						...syncState.coordinationClaim,
					}),
				)
			this.send({ type: 'join', deviceName: syncState.deviceName })
			if (this.isCoordinator) void this._handlePeerJoin()
		}
		dc.onclose = () => {
			if (this.inboundDcs.get(peerId) === dc) this.inboundDcs.delete(peerId)
		}
	}

	private _newPeer(peerId: string, generation: string): PeerTransport {
		this.peerTransports.get(peerId)?.pc.close()
		const pc = new RTCPeerConnection({
			iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
			iceTransportPolicy: 'all',
			bundlePolicy: 'max-bundle',
		})
		const transport: PeerTransport = { pc, generation, pendingIce: [] }
		const early = this.earlyIce.get(peerId)
		if (early?.generation === generation)
			transport.pendingIce.push(...early.candidates)
		this.earlyIce.delete(peerId)
		this.peerTransports.set(peerId, transport)
		this.pc = pc
		this._monitorConnection(pc, peerId)
		pc.onicecandidate = (event) => {
			if (event.candidate)
				this._sendSignal({
					type: 'ice',
					to: peerId,
					generation,
					candidates: [event.candidate.toJSON()],
				})
		}
		return transport
	}

	private async _offerPeer(peerId: string) {
		const generation = makeConnectionId()
		const transport = this._newPeer(peerId, generation)
		const dc = transport.pc.createDataChannel(DC_NAME)
		this._attachDataChannel(dc, peerId)
		await transport.pc.setLocalDescription(await transport.pc.createOffer())
		this._sendSignal({
			type: 'offer',
			to: peerId,
			generation,
			sdp: transport.pc.localDescription,
		})
	}

	private async _handleSignal(message: SignalMessage) {
		if (message.type === 'peers') {
			const wasCoordinator = this.isCoordinator
			const signaled = message.peers
				.filter((peer) => peer.id !== syncState.sessionId)
				.map((peer) => ({
					sessionId: peer.id,
					name: peer.name,
					connected: this.inboundDcs.get(peer.id)?.readyState === 'open',
				}))
			syncState.roomPeers = signaled
			if (
				syncState.coordinationClaim &&
				syncState.coordinationClaim.claimantId !== syncState.sessionId &&
				!signaled.some(
					(peer) => peer.sessionId === syncState.coordinationClaim?.claimantId,
				)
			)
				syncState.coordinationClaim = null
			if (!wasCoordinator && this.isCoordinator) {
				this.broadcastClockState()
				void this.onFileLoaded()
			}
			for (const peer of message.peers)
				if (
					syncState.sessionId &&
					syncState.sessionId < peer.id &&
					!this.peerTransports.has(peer.id)
				)
					void this._offerPeer(peer.id)
			return
		}
		if (
			message.type === 'offer' &&
			syncState.sessionId &&
			message.from < syncState.sessionId
		) {
			const transport = this._newPeer(message.from, message.generation)
			transport.pc.ondatachannel = (event) =>
				this._attachDataChannel(event.channel, message.from)
			await transport.pc.setRemoteDescription(message.sdp)
			for (const ice of transport.pendingIce.splice(0))
				await transport.pc.addIceCandidate(ice)
			await transport.pc.setLocalDescription(await transport.pc.createAnswer())
			this._sendSignal({
				type: 'answer',
				to: message.from,
				generation: message.generation,
				sdp: transport.pc.localDescription,
			})
			return
		}
		const transport = this.peerTransports.get(message.from)
		if (!transport || transport.generation !== message.generation) {
			if (message.type === 'ice')
				this.earlyIce.set(message.from, {
					generation: message.generation,
					candidates: message.candidates,
				})
			return
		}
		if (message.type === 'answer') {
			await transport.pc.setRemoteDescription(message.sdp)
			for (const ice of transport.pendingIce.splice(0))
				await transport.pc.addIceCandidate(ice)
		} else if (message.type === 'ice') {
			if (!transport.pc.remoteDescription)
				transport.pendingIce.push(...message.candidates)
			else
				for (const ice of message.candidates)
					await transport.pc.addIceCandidate(ice)
		}
	}

	// ------------------------------------------------------------------
	// Discovery / presence (one hibernatable Durable Object WebSocket)
	// ------------------------------------------------------------------

	private _connectPresence(): Promise<void> {
		if (!syncState.roomCode || !syncState.sessionId) {
			return Promise.reject(new Error('Room transport is not ready'))
		}
		this._closePresenceSocket()
		this.presenceIntentionalClose = false
		const url = new URL(`${API}/room`, location.origin)
		url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
		url.searchParams.set('code', syncState.roomCode)
		url.searchParams.set('id', syncState.sessionId)
		url.searchParams.set('name', syncState.deviceName.slice(0, 64))

		return new Promise((resolve, reject) => {
			const socket = new WebSocket(url, ['subtitle-sync'])
			this.presenceSocket = socket
			let settled = false
			const fail = () => {
				if (!settled) {
					settled = true
					reject(new Error('Could not connect to room presence'))
				}
			}
			socket.onmessage = (event) => {
				try {
					const message = JSON.parse(String(event.data)) as SignalMessage
					void this._handleSignal(message).catch((err) =>
						console.warn('Signal failed', err),
					)
					this.presenceReconnectAttempts = 0
					if (!settled && message.type === 'peers') {
						settled = true
						resolve()
					}
				} catch (err) {
					console.warn('Ignoring malformed presence message', err)
				}
			}
			socket.onerror = fail
			socket.onclose = () => {
				const isCurrentSocket = this.presenceSocket === socket
				if (isCurrentSocket) this.presenceSocket = null
				fail()
				if (
					isCurrentSocket &&
					!this.presenceIntentionalClose &&
					syncState.role === 'peer' &&
					syncState.roomCode
				) {
					this._schedulePresenceReconnect()
				}
			}
		})
	}

	private _sendSignal(message: Record<string, unknown>) {
		if (this.presenceSocket?.readyState === WebSocket.OPEN)
			this.presenceSocket.send(JSON.stringify(message))
	}

	private _schedulePresenceReconnect() {
		if (this.presenceReconnectTimer !== null) return
		if (this.presenceReconnectAttempts >= MAX_PRESENCE_RECONNECT_ATTEMPTS) {
			if (syncState.connectionState !== 'connected') {
				syncState.connectionState = 'error'
				syncState.error = 'Could not reconnect directly to the other device'
			}
			return
		}
		const attempt = this.presenceReconnectAttempts++
		const delay = Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 500
		this.presenceReconnectTimer = window.setTimeout(() => {
			this.presenceReconnectTimer = null
			void this._connectPresence().catch(() => {})
		}, delay)
	}

	private _closePresenceSocket() {
		this.presenceIntentionalClose = true
		if (this.presenceReconnectTimer !== null) {
			window.clearTimeout(this.presenceReconnectTimer)
			this.presenceReconnectTimer = null
		}
		this.presenceSocket?.close(1000, 'Leaving room')
		this.presenceSocket = null
	}

	// ------------------------------------------------------------------
	// Timers
	// ------------------------------------------------------------------

	private _startBroadcastTimer() {
		this._stopBroadcastTimer()
		this.broadcastTimer = window.setInterval(() => {
			if (this.isCoordinator && clock.isPlaying) {
				this.broadcastClockState()
			}
		}, BROADCAST_INTERVAL_MS)
	}

	private _stopBroadcastTimer() {
		if (this.broadcastTimer !== null) {
			window.clearInterval(this.broadcastTimer)
			this.broadcastTimer = null
		}
	}

	private _startPing() {
		this._stopPing()
		this.pingTimer = window.setInterval(() => {
			this.send({ type: 'ping', sentAt: Date.now() })
		}, PING_INTERVAL_MS)
	}

	private _stopPing() {
		if (this.pingTimer !== null) {
			window.clearInterval(this.pingTimer)
			this.pingTimer = null
		}
	}

	private _startConnectTimeout() {
		this._clearConnectTimeout()
		this.connectTimeout = window.setTimeout(() => {
			if (syncState.connectionState === 'connecting') {
				syncState.connectionState = 'error'
				syncState.error = 'Connection timed out'
			}
		}, CONNECT_TIMEOUT_MS)
	}

	private _clearConnectTimeout() {
		if (this.connectTimeout !== null) {
			window.clearTimeout(this.connectTimeout)
			this.connectTimeout = null
		}
	}

	// ------------------------------------------------------------------
	// Teardown
	// ------------------------------------------------------------------

	private _fail(err: unknown, friendlyMessage?: string) {
		console.error('Sync failed', err)
		syncState.connectionState = 'error'
		syncState.error =
			friendlyMessage ??
			(err instanceof Error ? err.message : 'Connection failed')
		syncState.role = 'none'
		this._teardownTransport()
	}

	private _teardownTransport() {
		this._closePresenceSocket()
		this._stopBroadcastTimer()
		this._stopPing()
		this._clearConnectTimeout()
		for (const dc of this.inboundDcs.values()) {
			dc.close()
		}
		this.inboundDcs.clear()
		for (const transport of this.peerTransports.values()) transport.pc.close()
		this.peerTransports.clear()
		this.earlyIce.clear()
		this.lastFileRequestAt.clear()
		this.peerReconnectAttempts.clear()
		this.pc?.close()
		this.pc = null
	}

	reset() {
		this._teardownTransport()
		syncState.role = 'none'
		syncState.sessionId = null
		syncState.roomCode = null
		syncState.connectionState = 'disconnected'
		syncState.error = null
		syncState.roomPeers = []
		syncState.coordinationClaim = null
		syncState.receivedFiles = []
		syncState.transfers = []
		syncState.pendingNowPlaying = null
		this.suppressNextFileAnnouncement = false
	}
}

export const syncStore = new SyncEngine()

// ----------------------------------------------------------------------
// Direct WebRTC helpers
// ----------------------------------------------------------------------

const makeConnectionId = () =>
	[...crypto.getRandomValues(new Uint8Array(16))]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('')

// ----------------------------------------------------------------------
// Playback helpers (exported for the controls UI)
// ----------------------------------------------------------------------

export const seekBy = (deltaMs: number) => syncStore.seekBy(deltaMs)
export const seekTo = (positionMs: number) => syncStore.seekTo(positionMs)
export const togglePlayback = () => syncStore.togglePlayback()
export const setPlaySpeed = (speed: number) => syncStore.setPlaySpeed(speed)
