import { proxy } from 'valtio'
import { nanoid } from 'nanoid'
import {
	backfillFileHashes,
	clock,
	getTimeElapsed,
	initAndGetDb,
	setClock,
	setSetting,
	getSetting,
	toggleIsPlaying,
} from './utils'
import { FileTransfer } from './file-transfer'
import { WebRtcTransport } from './webrtc-transport'

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

const BROADCAST_INTERVAL_MS = 100
const PING_INTERVAL_MS = 5000
const CONNECT_TIMEOUT_MS = 15000
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
	hash: string
	name: string
}

/** A file this device wants to play, by its local copy. */
export interface PlayerFile {
	fileId: string
	hash: string
	name: string
}

export type SyncMessage =
	| { type: 'cmd-play' }
	| { type: 'cmd-pause' }
	| { type: 'cmd-seek'; positionMs: number }
	| { type: 'cmd-speed'; speed: number }
	| { type: 'request-player'; sessionId: string }
	| { type: 'play-file'; hash: string; name: string }
	| { type: 'claim-coordinator'; term: number; claimantId: string }
	| {
			type: 'state-clock'
			isPlaying: boolean
			positionMs: number
			playSpeed: number
	  }
	| { type: 'join'; deviceName: string }
	| { type: 'leave'; deviceName: string }
	| { type: 'now-playing'; hash: string; name: string }
	| { type: 'file-list'; files: { hash: string; name: string }[] }
	| { type: 'request-file'; hash: string }
	| {
			type: 'file-chunk'
			transferId: string
			chunkIndex: number
			totalChunks: number
			hash: string
			name: string
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
	/**
	 * The file the group is currently playing, mapped to this device's local
	 * copy. fileId is null until a local copy exists (incoming transfer).
	 * hash is the content hash — the cross-device file identity.
	 */
	nowPlayingFile: { fileId: string | null; hash: string; name: string } | null
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
	nowPlayingFile: null,
	myGroupCode: null,
	joinedGroupCode: null,
	wasSharing: false,
	isRestoring: false,
})

// Debug hooks (kept for manual inspection in the browser console).
if (typeof window !== 'undefined') {
	const w = window as unknown as {
		__syncState: SyncState
		__seek: (ms: number) => void
		__togglePlayback: () => void
	}
	w.__syncState = syncState
	w.__seek = (ms) => syncStore.seekTo(ms)
	w.__togglePlayback = () => syncStore.togglePlayback()
}

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

/**
 * The device that renders is always the coordination claimant (the claim is
 * the sole authority transition — see the claim-coordinator handler). This
 * derives that id, so the two concepts can never drift apart.
 */
export const getActivePlayerId = (
	state: Pick<SyncState, 'coordinationClaim'>,
): string | null => state.coordinationClaim?.claimantId ?? null

/** Readonly snapshot shape (from useSnapshot) accepted by the helpers. */
export type SyncSnapshot = Readonly<{
	role: SyncState['role']
	sessionId: SyncState['sessionId']
	deviceName: SyncState['deviceName']
	roomPeers: readonly PeerInfo[]
	coordinationClaim: SyncState['coordinationClaim']
	nowPlayingFile: SyncState['nowPlayingFile']
}>

export const activePlayerOnline = (state: SyncSnapshot): boolean => {
	const id = getActivePlayerId(state)
	if (!id) return false
	if (id === state.sessionId) return true
	return state.roomPeers.some((peer) => peer.sessionId === id && peer.connected)
}

export const activePlayerName = (state: SyncSnapshot): string | null => {
	const id = getActivePlayerId(state)
	if (!id) return null
	if (id === state.sessionId) return state.deviceName
	return state.roomPeers.find((peer) => peer.sessionId === id)?.name ?? null
}

/** Shows the RemotePanel (controller UI) instead of the subtitle stage. */
export const isRemote = (state: SyncSnapshot): boolean =>
	state.role === 'peer' &&
	state.nowPlayingFile !== null &&
	getActivePlayerId(state) !== state.sessionId

/** Renders the subtitle stage as the active player. */
export const isRenderer = (state: SyncSnapshot): boolean =>
	state.role === 'peer' && getActivePlayerId(state) === state.sessionId

/**
 * Should a freshly opened file be cast to the existing player rather than
 * played here? True when a live player exists and it isn't this device.
 * (Distinct from `isRemote`: that answers "show the remote panel", which also
 * holds when the player is offline.)
 */
export const isRemoteController = (state: SyncSnapshot): boolean =>
	state.role === 'peer' &&
	getActivePlayerId(state) !== state.sessionId &&
	activePlayerOnline(state)

class SyncEngine {
	/** WebRTC mesh + presence socket (relays only SDP/ICE) */
	rtc = new WebRtcTransport(this, syncState)
	broadcastTimer: number | null = null
	pingTimer: number | null = null
	connectTimeout: number | null = null
	/** file-sharing protocol (chunked transfer, keyed by content hash) */
	fileTransfer = new FileTransfer(this, syncState)
	lastPlayerRequestAt = new Map<string, number>()

	/** true while the local timeline scrubber is being dragged (suppress clock) */
	isScrubbing = false

	/**
	 * Set by the player page when a file is opened before the device has
	 * joined a group: claim the player role once the group settles, unless a
	 * peer is already playing (a now-playing announcement disarms this).
	 */
	pendingPlayerFile: PlayerFile | null = null

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
		// Files imported before hashing existed need a content hash before they
		// can be announced or matched across devices.
		await backfillFileHashes()
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
		this.pendingPlayerFile = null
		syncState.wasSharing = false
		await setSetting('wasSharing', false)
	}

	/** Leave a group we joined and go back to our own group. */
	async leaveGroup() {
		this.send({ type: 'leave', deviceName: syncState.deviceName })
		this.reset()
		this.pendingPlayerFile = null
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

	send(msg: SyncMessage) {
		const raw = JSON.stringify(msg)
		for (const dc of this.rtc.inboundDcs.values()) {
			if (dc.readyState === 'open') dc.send(raw)
		}
	}

	async sendWithBackpressure(msg: SyncMessage) {
		const raw = JSON.stringify(msg)
		for (const dc of this.rtc.inboundDcs.values()) {
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
			await this.rtc.connectPresence()
			this._startBroadcastTimer()
			this._startPing()

			syncState.connectionState = 'connected'
			this.clearConnectTimeout()
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

	/** While true, incoming state-clock messages are ignored (timeline drag). */
	setScrubbing(scrubbing: boolean) {
		this.isScrubbing = scrubbing
	}

	// ------------------------------------------------------------------
	// Active player / coordinator broadcasts
	// ------------------------------------------------------------------

	/**
	 * Make this device the active player (renders the subtitle stage): claim
	 * coordination, then announce the file. The claim IS the player role.
	 * `adoptFile` seeds now-playing when the group has nothing playing yet.
	 */
	async becomeActivePlayer(adoptFile?: PlayerFile) {
		if (syncState.role !== 'peer' || !syncState.sessionId) return
		// Claim unless we already hold the claim. Guarding on the claim (not on
		// `isCoordinator`) matters: the default coordinator (lowest id, no claim
		// yet) must still claim, or the derived player id stays null and this
		// device would render the remote panel instead of the player.
		if (syncState.coordinationClaim?.claimantId !== syncState.sessionId) {
			const claim = {
				term: (syncState.coordinationClaim?.term ?? 0) + 1,
				claimantId: syncState.sessionId,
			}
			syncState.coordinationClaim = claim
			this.send({ type: 'claim-coordinator', ...claim })
		}
		if (!syncState.nowPlayingFile && adoptFile) {
			syncState.nowPlayingFile = adoptFile
		}
		await this.announceFile()
	}

	/**
	 * Request to take the player role once the group settles, used when a file
	 * is opened before the device has connected. Completes deterministically
	 * (see the takeover triggers); a peer already playing disarms it.
	 */
	requestPlayerRole(file: PlayerFile) {
		this.pendingPlayerFile = file
	}

	/** Re-broadcast the current file to the group (no claim). */
	async announceFile() {
		if (!this.isCoordinator) return
		const np = syncState.nowPlayingFile
		if (np?.fileId) {
			this.send({ type: 'now-playing', hash: np.hash, name: np.name })
		}
		await this.broadcastFileList()
	}

	/**
	 * Pick which device renders. Selecting "this device" claims locally;
	 * selecting a peer asks it to claim (a pure request — only the fenced
	 * claim-coordinator message changes who the player is).
	 */
	setPlayer(sessionId: string) {
		if (syncState.role !== 'peer') return
		if (sessionId === syncState.sessionId) {
			void this.becomeActivePlayer()
			return
		}
		if (!syncState.roomPeers.some((peer) => peer.sessionId === sessionId))
			return
		this.send({ type: 'request-player', sessionId })
	}

	/**
	 * Play a file by content hash. From a remote this routes to the
	 * coordinator (which, by the claim invariant, is always the active player);
	 * from the renderer itself it loads the file directly.
	 */
	playFile(hash: string, name: string) {
		if (syncState.role !== 'peer') return
		if (this.isCoordinator) {
			void this._handlePlayFile(hash, name)
			return
		}
		this.send({ type: 'play-file', hash, name })
	}

	private async _handlePlayFile(hash: string, name: string) {
		if (!this.isCoordinator) return
		const db = await initAndGetDb()
		const existing = (await db.getAll('files')).find((f) => f.hash === hash)
		if (existing) {
			syncState.nowPlayingFile = { fileId: existing.id, hash, name }
			await this.announceFile()
			return
		}
		// Renderer doesn't have the file yet; pull it from the group.
		syncState.nowPlayingFile = { fileId: null, hash, name }
		this.send({ type: 'request-file', hash })
	}

	async broadcastFileList() {
		if (!this.isCoordinator) return
		const db = await initAndGetDb()
		const files = await db.getAll('files')
		this.send({
			type: 'file-list',
			files: files
				.filter((file) => file.hash)
				.slice(0, 256)
				.map((file) => ({
					hash: file.hash as string,
					name: file.name.slice(0, 256),
				})),
		})
	}

	/** Domain hook for "the local library changed" (e.g. after an import). */
	async onFilesChanged() {
		await this.broadcastFileList()
	}

	sendFile(hash: string) {
		void this.fileTransfer.sendFile(hash)
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

	handleMessage(value: unknown, peerId: string) {
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
			) {
				syncState.coordinationClaim = {
					term: msg.term,
					claimantId: msg.claimantId,
				}
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
					'request-player',
					'play-file',
					'join',
					'leave',
					'request-file',
					'file-chunk',
					'ping',
					'pong',
				])
			: fromCoordinator
				? new Set([
						'state-clock',
						'now-playing',
						'file-list',
						'file-chunk',
						'request-player',
						'request-file',
						'ping',
						'pong',
					])
				: new Set(['request-player', 'ping', 'pong'])
		if (!allowed.has(msg.type)) return
		switch (msg.type) {
			case 'request-player':
				// A pure request: only the addressed device acts, and it claims
				// through the fenced claim-coordinator message.
				if (
					typeof msg.sessionId !== 'string' ||
					msg.sessionId !== syncState.sessionId
				)
					return
				if (Date.now() - (this.lastPlayerRequestAt.get(peerId) ?? 0) < 2000)
					return
				this.lastPlayerRequestAt.set(peerId, Date.now())
				void this.becomeActivePlayer()
				return
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
				if (
					typeof msg.hash !== 'string' ||
					msg.hash.length > 128 ||
					typeof msg.name !== 'string' ||
					msg.name.length > 256
				)
					return
				// A peer is already playing; we're a follower.
				this.pendingPlayerFile = null
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
							typeof file.hash !== 'string' ||
							file.hash.length > 128 ||
							typeof file.name !== 'string' ||
							file.name.length > 256,
					)
				)
					return
				// The coordinator answered our join (file-list always follows
				// any now-playing on the same channel). No player announced and
				// none claimed => nobody is playing, so take the role.
				if (this.pendingPlayerFile && !syncState.coordinationClaim) {
					const file = this.pendingPlayerFile
					this.pendingPlayerFile = null
					void this.becomeActivePlayer(file)
				}
				void this._handleFileList(msg).catch((err) =>
					console.error('file-list handler failed', err),
				)
				return
			case 'file-chunk':
				this._handleFileChunk(msg)
				return
			case 'request-file':
				if (typeof msg.hash !== 'string' || msg.hash.length > 128) return
				if (
					Date.now() - (this.fileTransfer.lastFileRequestAt.get(peerId) ?? 0) <
					2000
				)
					return
				this.fileTransfer.lastFileRequestAt.set(peerId, Date.now())
				void this.fileTransfer.sendFile(msg.hash)
				return
			case 'ping':
				this.send({ type: 'pong', sentAt: msg.sentAt })
				return
		}

		if (!this.isCoordinator) return

		switch (msg.type) {
			case 'play-file':
				if (
					typeof msg.hash !== 'string' ||
					msg.hash.length > 128 ||
					typeof msg.name !== 'string' ||
					msg.name.length > 256
				)
					return
				void this._handlePlayFile(msg.hash, msg.name)
				return
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
				void this.handlePeerJoin()
				return
			case 'leave':
				this._handlePeerLeave(msg.deviceName)
				return
		}
	}

	private _applyClockState(msg: Extract<SyncMessage, { type: 'state-clock' }>) {
		if (this.isScrubbing) return
		setClock({ lastActionAt: Date.now(), lastTimeElapsedMs: msg.positionMs })
		toggleIsPlaying(msg.isPlaying)
		setClock({
			playSpeed: msg.playSpeed,
			lastActionAt: Date.now(),
			lastTimeElapsedMs: getTimeElapsed(),
		})
	}

	async handlePeerJoin() {
		// A peer joined while we're the idle coordinator with a file open and
		// nobody playing: take the stage so the newcomer has something to see.
		if (this.pendingPlayerFile && !syncState.coordinationClaim) {
			const file = this.pendingPlayerFile
			this.pendingPlayerFile = null
			await this.becomeActivePlayer(file)
		}
		// Push current state so a newly joined device catches up.
		await this.announceFile()
		this.broadcastClockState()
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
		const existing = (await db.getAll('files')).find((f) => f.hash === msg.hash)
		if (existing) {
			syncState.nowPlayingFile = {
				fileId: existing.id,
				hash: msg.hash,
				name: msg.name,
			}
			return
		}
		syncState.nowPlayingFile = { fileId: null, hash: msg.hash, name: msg.name }
		this.send({ type: 'request-file', hash: msg.hash })
	}

	private _handleFileList(msg: Extract<SyncMessage, { type: 'file-list' }>) {
		return this.fileTransfer.handleFileList(msg)
	}

	private _handleFileChunk(msg: Extract<SyncMessage, { type: 'file-chunk' }>) {
		this.fileTransfer.handleFileChunk(msg)
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
		this.clearConnectTimeout()
		this.connectTimeout = window.setTimeout(() => {
			if (syncState.connectionState === 'connecting') {
				syncState.connectionState = 'error'
				syncState.error = 'Connection timed out'
			}
		}, CONNECT_TIMEOUT_MS)
	}

	clearConnectTimeout() {
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
		this.rtc.teardown()
		this._stopBroadcastTimer()
		this._stopPing()
		this.clearConnectTimeout()
		this.fileTransfer.lastFileRequestAt.clear()
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
		syncState.nowPlayingFile = null
		this.isScrubbing = false
		// pendingPlayerFile is deliberately NOT cleared here: it survives a
		// reconnect so a file opened before joining still claims once the
		// group settles. Explicit leave clears it (see stopSharing/leaveGroup).
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
