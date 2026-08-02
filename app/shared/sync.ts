import * as mobx from 'mobx'
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
	type DbLine,
} from './utils'

/**
 * Multi-device sync over direct, bidirectional WebRTC data channels.
 * A hibernatable Durable Object relays only temporary SDP/ICE signaling;
 * No relay is configured: peers must establish a direct connection.
 *
 * Device pairing: every device owns a persistent pairing code and can
 * either share its own code (QR/code on screen) or connect to another
 * device's code. The device whose code you connect to is the "host":
 * its clock is authoritative, and the connected device controls it
 * with play/pause/seek/speed commands.
 *
 * Topology is hub-and-spoke, with one full-duplex data channel per pair.
 */

const API = '/api/sync'
const DC_NAME = 'subtitles'
const CHUNK_SIZE = 32 * 1024
const BROADCAST_INTERVAL_MS = 100
const PING_INTERVAL_MS = 5000
const CONNECT_TIMEOUT_MS = 15000
const MAX_PRESENCE_RECONNECT_ATTEMPTS = 6
const MAX_OUTBOUND_QUEUE = 128
const MAX_CONCURRENT_TRANSFERS = 4
const MAX_TRANSFER_CHUNKS = 1024
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export type SyncRole = 'none' | 'host' | 'follower'
export type ConnectionState =
	'disconnected' | 'connecting' | 'connected' | 'error'

export interface PeerInfo {
	sessionId: string
	name: string
	isHost: boolean
	connected: boolean
}

export interface ReceivedFile {
	fileId: string
	name: string
}

type SignalMessage =
	| { type: 'peers'; peers: { id: string; name: string; isHost: boolean }[] }
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
	| { type: 'file-deleted'; fileId: string; fileName: string }
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

class SyncStore {
	role: SyncRole = 'none'
	sessionId: string | null = null
	roomCode: string | null = null
	connectionState: ConnectionState = 'disconnected'
	error: string | null = null
	deviceName: string
	roomPeers: PeerInfo[] = []
	receivedFiles: ReceivedFile[] = []
	transfers: { fileName: string; received: number; total: number }[] = []
	pendingNowPlaying: ReceivedFile | null = null

	/** this device's own persistent group code */
	myGroupCode: string | null = null
	/** group code we joined (null = our own group) */
	joinedGroupCode: string | null = null
	/** whether our own group was active when we last left */
	wasSharing = false
	/** true while restoring a previously active group */
	isRestoring = false

	/** non-observable WebRTC state */
	pc: RTCPeerConnection | null = null
	peerTransports = new Map<string, PeerTransport>()
	earlyIce = new Map<
		string,
		{ generation: string; candidates: RTCIceCandidateInit[] }
	>()
	outboundDc: RTCDataChannel | null = null
	inboundDcs: Map<string, RTCDataChannel> = new Map()
	outboundQueue: string[] = []
	presenceSocket: WebSocket | null = null
	presenceReconnectTimer: number | null = null
	presenceReconnectAttempts = 0
	presenceIntentionalClose = false
	roomOwnerToken: string | null = null
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

	constructor() {
		this.deviceName = `Device ${Math.floor(Math.random() * 1000)}`
		mobx.makeAutoObservable(
			this,
			{
				pc: false,
				peerTransports: false,
				earlyIce: false,
				outboundDc: false,
				inboundDcs: false,
				outboundQueue: false,
				presenceSocket: false,
				presenceReconnectTimer: false,
				presenceReconnectAttempts: false,
				presenceIntentionalClose: false,
				roomOwnerToken: false,
				broadcastTimer: false,
				pingTimer: false,
				connectTimeout: false,
				receiveBuffers: false,
				pendingNowPlayingRequests: false,
			},
			{ autoBind: true },
		)
	}

	// ------------------------------------------------------------------
	// Persistent group identity
	// ------------------------------------------------------------------

	async init() {
		this.myGroupCode = (await getSetting<string>('myGroupCode')) ?? null
		this.joinedGroupCode = (await getSetting<string>('joinedGroupCode')) ?? null
		this.wasSharing = (await getSetting<boolean>('wasSharing')) ?? false
		this.roomOwnerToken = (await getSetting<string>('roomOwnerToken')) ?? null
		const deviceName = await getSetting<string>('deviceName')
		if (typeof deviceName === 'string' && deviceName.length > 0) {
			this.deviceName = deviceName
		} else {
			await setSetting('deviceName', this.deviceName)
		}
	}

	/** Bring back the previously active group when opening the app. */
	async restore() {
		await this.init()
		if (this.connectionState !== 'disconnected') return
		this.isRestoring = true
		try {
			if (this.joinedGroupCode) {
				await this.joinGroup(this.joinedGroupCode)
			} else if (this.wasSharing) {
				await this.startSharing()
			}
		} finally {
			this.isRestoring = false
		}
	}

	private async ensureMyGroup(): Promise<string> {
		if (!this.myGroupCode || this.myGroupCode.length !== 20) {
			this.myGroupCode = makeRoomCode()
			await setSetting('myGroupCode', this.myGroupCode)
		}
		if (!this.roomOwnerToken) {
			const bytes = new Uint8Array(32)
			crypto.getRandomValues(bytes)
			this.roomOwnerToken = [...bytes]
				.map((byte) => byte.toString(16).padStart(2, '0'))
				.join('')
			await setSetting('roomOwnerToken', this.roomOwnerToken)
		}
		return this.myGroupCode
	}

	async setDeviceName(name: string) {
		this.deviceName = name
		await setSetting('deviceName', name)
	}

	/** Share our own group; showing the QR implicitly starts it. */
	async startSharing() {
		const code = await this.ensureMyGroup()
		await this.createHostSession(code)
		if (this.role === 'host' && this.connectionState === 'connected') {
			this.joinedGroupCode = null
			this.wasSharing = true
			await setSetting('joinedGroupCode', null)
			await setSetting('wasSharing', true)
		}
	}

	/** Join someone else's group. */
	async joinGroup(code: string) {
		await this.joinSession(code)
		if (this.role === 'follower' && this.connectionState === 'connected') {
			this.joinedGroupCode = this.roomCode
			this.wasSharing = false
			await setSetting('joinedGroupCode', this.roomCode)
			await setSetting('wasSharing', false)
		}
	}

	/** Stop sharing our group (the group code is kept for later). */
	async stopSharing() {
		this.send({ type: 'leave', deviceName: this.deviceName })
		this.reset()
		this.wasSharing = false
		await setSetting('wasSharing', false)
	}

	/** Leave a group we joined and go back to our own group. */
	async leaveGroup() {
		this.send({ type: 'leave', deviceName: this.deviceName })
		this.reset()
		this.joinedGroupCode = null
		await setSetting('joinedGroupCode', null)
	}

	reconnect() {
		if (this.role === 'host' && this.roomCode) {
			void this.createHostSession(this.roomCode)
		} else if (this.role === 'follower' && this.roomCode) {
			void this.joinSession(this.roomCode)
		}
	}

	/** Consume the announced now-playing file (cleared after opening it). */
	consumePendingNowPlaying() {
		this.pendingNowPlaying = null
	}

	send(msg: SyncMessage) {
		const raw = JSON.stringify(msg)
		if (this.role === 'host') {
			for (const dc of this.inboundDcs.values()) {
				if (dc.readyState === 'open') dc.send(raw)
			}
		} else if (this.outboundDc && this.outboundDc.readyState === 'open') {
			this.outboundDc.send(raw)
		} else {
			if (this.outboundQueue.length >= MAX_OUTBOUND_QUEUE)
				this.outboundQueue.shift()
			this.outboundQueue.push(raw)
		}
	}

	// ------------------------------------------------------------------
	// Connection setup
	// ------------------------------------------------------------------

	private async createHostSession(keepCode: string) {
		this.reset()
		this.connectionState = 'connecting'
		this.role = 'host'

		try {
			this.sessionId = makeConnectionId()
			this.roomCode = keepCode
			this._startConnectTimeout()
			await this._connectPresence('host')
			this._startBroadcastTimer()
			this._startPing()

			this.connectionState = 'connected'
			this._clearConnectTimeout()
			void this.onFileLoaded()
		} catch (err) {
			this._fail(err)
		}
	}

	private async joinSession(code: string) {
		this.reset()
		this.connectionState = 'connecting'
		this.role = 'follower'

		try {
			this.roomCode = code.toUpperCase()
			this.sessionId = makeConnectionId()
			this._startPing()
			this._startConnectTimeout()
			await this._connectPresence('follower')
			await this._waitForPeerConnection()
		} catch (err) {
			this._fail(
				err,
				'Could not reach this group. Make sure the owner is sharing and try again.',
			)
		}
	}

	private _waitForPeerConnection(): Promise<void> {
		return new Promise((resolve, reject) => {
			const started = Date.now()
			const check = window.setInterval(() => {
				if (this.connectionState === 'connected') {
					window.clearInterval(check)
					resolve()
				} else if (Date.now() - started >= CONNECT_TIMEOUT_MS) {
					window.clearInterval(check)
					reject(new Error('Connection timed out'))
				}
			}, 100)
		})
	}

	// ------------------------------------------------------------------
	// Clock helpers (used by the controls UI)
	// ------------------------------------------------------------------

	seekBy(deltaMs: number) {
		this.seekTo(getTimeElapsed() + deltaMs)
	}

	seekTo(positionMs: number) {
		setClock({ lastActionAt: Date.now(), lastTimeElapsedMs: positionMs })
		if (this.role === 'host') {
			this.broadcastClockState()
		} else if (this.role !== 'none') {
			this.send({ type: 'cmd-seek', positionMs: getTimeElapsed() })
		}
	}

	togglePlayback() {
		const isPlaying = !clock.isPlaying
		clock.toggleIsPlaying(isPlaying)
		if (this.role === 'host') {
			this.broadcastClockState()
		} else if (this.role !== 'none') {
			this.send({ type: isPlaying ? 'cmd-play' : 'cmd-pause' })
		}
	}

	setPlaySpeed(speed: number) {
		setClock({
			playSpeed: speed,
			lastActionAt: Date.now(),
			lastTimeElapsedMs: getTimeElapsed(),
		})
		if (this.role === 'host') {
			this.broadcastClockState()
		} else if (this.role !== 'none') {
			this.send({ type: 'cmd-speed', speed })
		}
	}

	// ------------------------------------------------------------------
	// Owner broadcasts
	// ------------------------------------------------------------------

	async onFileLoaded() {
		if (this.role !== 'host') return
		await this.broadcastNowPlaying()
		await this.broadcastFileList()
	}

	async broadcastNowPlaying() {
		if (this.role !== 'host') return
		const lines = getFile()
		const fileId = lines?.[0]?.fileId
		if (!fileId) return
		const db = await initAndGetDb()
		const file = await db.get('files', fileId)
		this.send({ type: 'now-playing', fileId, name: file?.name ?? 'Subtitle' })
	}

	async broadcastFileList() {
		if (this.role !== 'host') return
		const db = await initAndGetDb()
		const files = await db.getAll('files')
		this.send({
			type: 'file-list',
			files: files.map((file) => ({ id: file.id, name: file.name })),
		})
	}

	async sendFile(fileName: string) {
		if (this.role !== 'host') return
		const db = await initAndGetDb()
		const file = (await db.getAll('files')).find((f) => f.name === fileName)
		if (!file) return
		const lines = await db.getAllFromIndex('lines', 'by-file-id', file.id)
		lines.sort((a, b) => a.from - b.from)
		if (lines.length === 0) return

		const text = linesToSrtText(lines)
		const transferId = nanoid()
		const totalChunks = Math.max(1, Math.ceil(text.length / CHUNK_SIZE))

		for (let i = 0; i < totalChunks; i++) {
			this.send({
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
		if (this.role !== 'host') return
		this.send({ type: 'file-deleted', fileId, fileName })
	}

	broadcastClockState() {
		if (this.role !== 'host' || this.connectionState !== 'connected') return
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

	private _handleMessage(value: unknown) {
		if (!value || typeof value !== 'object' || Array.isArray(value)) return
		const msg = value as SyncMessage
		const allowed =
			this.role === 'host'
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
				: new Set([
						'state-clock',
						'now-playing',
						'file-list',
						'file-chunk',
						'file-deleted',
						'ping',
						'pong',
					])
		if (!allowed.has(msg.type)) return
		switch (msg.type) {
			case 'state-clock':
				this._applyClockState(msg)
				return
			case 'now-playing':
				void this._handleNowPlaying(msg).catch((err) =>
					console.error('now-playing handler failed', err),
				)
				return
			case 'file-list':
				void this._handleFileList(msg).catch((err) =>
					console.error('file-list handler failed', err),
				)
				return
			case 'file-chunk':
				this._handleFileChunk(msg)
				return
			case 'file-deleted':
				void this._handleFileDeleted(msg).catch((err) =>
					console.error('file-deleted handler failed', err),
				)
				return
			case 'ping':
				this.send({ type: 'pong', sentAt: msg.sentAt })
				return
		}

		if (this.role !== 'host') return

		switch (msg.type) {
			case 'cmd-play':
				if (!clock.isPlaying) {
					clock.toggleIsPlaying(true)
					this.broadcastClockState()
				}
				return
			case 'cmd-pause':
				if (clock.isPlaying) {
					clock.toggleIsPlaying(false)
					this.broadcastClockState()
				}
				return
			case 'cmd-seek':
				setClock({
					lastActionAt: Date.now(),
					lastTimeElapsedMs: msg.positionMs,
				})
				this.broadcastClockState()
				return
			case 'cmd-speed':
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
				void this.sendFile(msg.fileName)
				return
		}
	}

	private _applyClockState(msg: Extract<SyncMessage, { type: 'state-clock' }>) {
		setClock({ lastActionAt: Date.now(), lastTimeElapsedMs: msg.positionMs })
		clock.toggleIsPlaying(msg.isPlaying)
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
		this.roomPeers = this.roomPeers.map((peer) =>
			peer.name === deviceName ? { ...peer, connected: false } : peer,
		)
	}

	private async _handleNowPlaying(
		msg: Extract<SyncMessage, { type: 'now-playing' }>,
	) {
		const db = await initAndGetDb()
		const existing = (await db.getAll('files')).find((f) => f.name === msg.name)
		if (existing) {
			this.pendingNowPlaying = { fileId: existing.id, name: msg.name }
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

	private async _handleFileDeleted(
		msg: Extract<SyncMessage, { type: 'file-deleted' }>,
	) {
		const db = await initAndGetDb()
		const file = (await db.getAll('files')).find((f) => f.name === msg.fileName)
		if (!file) return
		const tx = db.transaction(['files', 'lines'], 'readwrite')
		tx.objectStore('files').delete(file.id)
		const keys = await tx
			.objectStore('lines')
			.index('by-file-id')
			.getAllKeys(file.id)
		for (const key of keys) {
			tx.objectStore('lines').delete(key)
		}
		await tx.done
	}

	private _updateTransfers() {
		this.transfers = [...this.receiveBuffers.values()].map((buffer) => ({
			fileName: buffer.fileName,
			received: buffer.chunks.filter((chunk) => chunk !== null).length,
			total: buffer.total,
		}))
	}

	private async _importReceivedFile(fileName: string, text: string) {
		if (this.receivedFiles.some((file) => file.name === fileName)) return
		try {
			const fileId = await addFileToDatabase(text, fileName)
			this.receivedFiles = [...this.receivedFiles, { fileId, name: fileName }]
			const pending = this.pendingNowPlayingRequests.get(fileName)
			if (pending) {
				this.pendingNowPlayingRequests.delete(fileName)
				this.pendingNowPlaying = { fileId, name: fileName }
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
				this.connectionState = 'connected'
				this.presenceReconnectAttempts = 0
				this._clearConnectTimeout()
				if (this.role === 'follower')
					this._sendSignal({
						type: 'ready',
						to: peerId,
						generation:
							this.peerTransports.get(peerId)?.generation ??
							makeConnectionId(),
					})
			}
			if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
				const transport = this.peerTransports.get(peerId)
				if (transport?.pc === pc) this.peerTransports.delete(peerId)
				this.roomPeers = this.roomPeers.map((peer) =>
					peer.sessionId === peerId ? { ...peer, connected: false } : peer,
				)
				if (
					this.role === 'follower' &&
					!this.presenceIntentionalClose &&
					this.roomCode
				) {
					this.connectionState = 'connecting'
					this._startConnectTimeout()
					this._schedulePresenceReconnect('follower')
				}
			}
		}
	}

	private _attachDataChannel(dc: RTCDataChannel, peerId: string) {
		dc.onmessage = (event) => {
			try {
				this._handleMessage(JSON.parse(event.data))
			} catch (err) {
				console.warn('Ignoring malformed sync message', err)
			}
		}
		dc.onopen = () => {
			if (this.role === 'follower') this.outboundDc = dc
			else this.inboundDcs.set(peerId, dc)
			this.roomPeers = this.roomPeers.map((peer) =>
				peer.sessionId === peerId ? { ...peer, connected: true } : peer,
			)
			while (this.outboundQueue.length > 0) {
				const raw = this.outboundQueue.shift()
				if (raw !== undefined) dc.send(raw)
			}
			if (this.role === 'follower')
				this.send({ type: 'join', deviceName: this.deviceName })
			else void this._handlePeerJoin()
		}
		dc.onclose = () => {
			this.inboundDcs.delete(peerId)
			if (this.outboundDc === dc) this.outboundDc = null
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
		if (this.role === 'follower') this.pc = pc
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
			const signaled = message.peers
				.filter((peer) => peer.id !== this.sessionId)
				.map((peer) => ({
					sessionId: peer.id,
					name: peer.name,
					isHost: peer.isHost,
					connected:
						this.inboundDcs.has(peer.id) ||
						(peer.isHost && this.outboundDc?.readyState === 'open'),
				}))
			const signaledIds = new Set(signaled.map((peer) => peer.sessionId))
			this.roomPeers = [
				...signaled,
				...this.roomPeers.filter(
					(peer) => peer.connected && !signaledIds.has(peer.sessionId),
				),
			]
			if (this.role === 'host')
				for (const peer of message.peers)
					if (!peer.isHost && !this.peerTransports.has(peer.id))
						void this._offerPeer(peer.id)
			return
		}
		if (message.type === 'offer' && this.role === 'follower') {
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
		if (message.type === 'answer' && this.role === 'host') {
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

	private _connectPresence(role: Exclude<SyncRole, 'none'>): Promise<void> {
		if (!this.roomCode || !this.sessionId) {
			return Promise.reject(new Error('Room transport is not ready'))
		}
		this._closePresenceSocket()
		this.presenceIntentionalClose = false
		const url = new URL(`${API}/room`, location.origin)
		url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
		url.searchParams.set('code', this.roomCode)
		url.searchParams.set('role', role)
		url.searchParams.set('id', this.sessionId)
		url.searchParams.set('name', this.deviceName.slice(0, 64))
		const protocols = ['subtitle-sync']
		if (role === 'host') {
			if (!this.roomOwnerToken) {
				return Promise.reject(new Error('Missing room owner credential'))
			}
			protocols.push(`host.${this.roomOwnerToken}`)
		}

		return new Promise((resolve, reject) => {
			const socket = new WebSocket(url, protocols)
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
					if (role === 'host') this.presenceReconnectAttempts = 0
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
					this.role === role &&
					(role === 'host' || this.connectionState !== 'connected') &&
					this.roomCode
				) {
					this._schedulePresenceReconnect(role)
				}
			}
		})
	}

	private _sendSignal(message: Record<string, unknown>) {
		if (this.presenceSocket?.readyState === WebSocket.OPEN)
			this.presenceSocket.send(JSON.stringify(message))
	}

	private _schedulePresenceReconnect(role: Exclude<SyncRole, 'none'>) {
		if (this.presenceReconnectTimer !== null) return
		if (
			this.presenceReconnectAttempts >= MAX_PRESENCE_RECONNECT_ATTEMPTS
		) {
			if (role === 'follower' && this.connectionState !== 'connected') {
				this.connectionState = 'error'
				this.error = 'Could not reconnect directly to the other device'
			}
			return
		}
		const attempt = this.presenceReconnectAttempts++
		const delay = Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 500
		this.presenceReconnectTimer = window.setTimeout(() => {
			this.presenceReconnectTimer = null
			void this._connectPresence(role).catch(() => {})
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
			if (this.role === 'host' && clock.isPlaying) {
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
			if (this.connectionState === 'connecting') {
				this.connectionState = 'error'
				this.error = 'Connection timed out'
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
		this.connectionState = 'error'
		this.error =
			friendlyMessage ??
			(err instanceof Error ? err.message : 'Connection failed')
		this.role = 'none'
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
		this.outboundDc?.close()
		this.outboundDc = null
		this.outboundQueue.length = 0
		for (const transport of this.peerTransports.values()) transport.pc.close()
		this.peerTransports.clear()
		this.earlyIce.clear()
		this.pc?.close()
		this.pc = null
	}

	reset() {
		this._teardownTransport()
		this.role = 'none'
		this.sessionId = null
		this.roomCode = null
		this.connectionState = 'disconnected'
		this.error = null
		this.roomPeers = []
		this.receivedFiles = []
		this.transfers = []
		this.pendingNowPlaying = null
	}
}

export const syncStore = new SyncStore()

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
