import { proxy } from 'valtio'
import {
	backfillFileHashes,
	clock,
	getTimeElapsed,
	initAndGetDb,
	makeConnectionId,
	saveLocalProgress,
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
 * Shared playback is modeled as a single-writer group document (`GroupState`):
 * one media, one claim/player, one clock. Device libraries are gossiped
 * separately. Subtitle bytes stay on P2P file-chunk transfers only.
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

/** Cross-device media identity (group-scoped — only one at a time). */
export interface GroupMedia {
	hash: string
	name: string
}

/** Fenced player/coordinator claim. */
export interface GroupClaim {
	term: number
	claimantId: string
}

/** Playback clock carried in group snapshots. */
export interface GroupClock {
	isPlaying: boolean
	positionMs: number
	playSpeed: number
}

/**
 * Authoritative shared group document. Single writer = claim claimant
 * (or the default lowest-id coordinator before anyone claims).
 */
export interface GroupState {
	media: GroupMedia | null
	claim: GroupClaim | null
	clock: GroupClock
}

export interface DeviceLibraryEntry {
	hash: string
	name: string
}

/** Proposed mutations from a follower → applied only by the claimant. */
export type GroupProposeOp =
	| { type: 'set-media'; hash: string; name: string }
	| {
			type: 'set-clock'
			isPlaying?: boolean
			positionMs?: number
			playSpeed?: number
	  }
	| { type: 'request-player'; sessionId: string }

export type SyncMessage =
	| { type: 'group-state'; state: GroupState }
	| { type: 'group-propose'; op: GroupProposeOp }
	| { type: 'device-state'; library: DeviceLibraryEntry[] }
	| { type: 'join'; deviceName: string }
	| { type: 'leave'; deviceName: string }
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

const emptyGroupClock = (): GroupClock => ({
	isPlaying: false,
	positionMs: 0,
	playSpeed: 1,
})

const emptyGroupState = (): GroupState => ({
	media: null,
	claim: null,
	clock: emptyGroupClock(),
})

const isValidClaim = (
	claim: GroupClaim | null | undefined,
): claim is GroupClaim =>
	!!claim &&
	Number.isSafeInteger(claim.term) &&
	claim.term >= 1 &&
	claim.term <= 1_000_000_000 &&
	typeof claim.claimantId === 'string' &&
	claim.claimantId.length > 0 &&
	claim.claimantId.length <= 128

/** True when `next` beats `current` under term/id fencing. */
const claimIsSuperior = (
	next: GroupClaim | null,
	current: GroupClaim | null,
): boolean => {
	if (!next) return false
	if (!current) return true
	return (
		next.term > current.term ||
		(next.term === current.term && next.claimantId > current.claimantId)
	)
}

const isValidGroupMedia = (
	media: GroupMedia | null | undefined,
): media is GroupMedia | null => {
	if (media === null || media === undefined) return media === null
	return (
		typeof media.hash === 'string' &&
		media.hash.length > 0 &&
		media.hash.length <= 128 &&
		typeof media.name === 'string' &&
		media.name.length <= 256
	)
}

const isValidGroupClock = (c: GroupClock | null | undefined): c is GroupClock =>
	!!c &&
	typeof c.isPlaying === 'boolean' &&
	Number.isFinite(c.positionMs) &&
	c.positionMs >= 0 &&
	Number.isFinite(c.playSpeed) &&
	c.playSpeed >= 0.1 &&
	c.playSpeed <= 5

export interface SyncState {
	role: SyncRole
	sessionId: string | null
	roomCode: string | null
	connectionState: ConnectionState
	error: string | null
	deviceName: string
	roomPeers: PeerInfo[]
	/**
	 * Authoritative group document. `media` is singular by construction —
	 * the group plays at most one title.
	 */
	group: GroupState
	/**
	 * Local projection of `group.media` onto this device's IndexedDB copy.
	 * fileId is null until a local copy exists (incoming transfer).
	 */
	nowPlayingFile: { fileId: string | null; hash: string; name: string } | null
	receivedFiles: ReceivedFile[]
	transfers: { fileName: string; received: number; total: number }[]
	myGroupCode: string | null
	/** group code we joined (null = our own group) */
	joinedGroupCode: string | null
	/** whether our own group was active when we last left */
	wasSharing: boolean
	/** true while restoring a previously active group */
	isRestoring: boolean
	/** true after IndexedDB settings (device name, group codes) have loaded */
	settingsReady: boolean
}

export const syncState = proxy<SyncState>({
	role: 'none',
	sessionId: null,
	roomCode: null,
	connectionState: 'disconnected',
	error: null,
	deviceName: `Device ${Math.floor(Math.random() * 1000)}`,
	roomPeers: [],
	group: emptyGroupState(),
	nowPlayingFile: null,
	receivedFiles: [],
	transfers: [],
	myGroupCode: null,
	joinedGroupCode: null,
	wasSharing: false,
	isRestoring: false,
	settingsReady: false,
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

const getCoordinatorId = (state: {
	sessionId: string | null
	roomPeers: readonly PeerInfo[]
	group: Pick<GroupState, 'claim'>
}): string | null => {
	if (!state.sessionId) return null
	const online = [
		state.sessionId,
		...state.roomPeers.map((peer) => peer.sessionId),
	]
	if (state.group.claim && online.includes(state.group.claim.claimantId))
		return state.group.claim.claimantId
	return online.sort()[0]
}

/**
 * The device that renders is always the coordination claimant (the claim is
 * the sole authority transition). This derives that id so player and claim
 * cannot drift apart.
 */
export const getActivePlayerId = (state: {
	group: Pick<GroupState, 'claim'>
}): string | null => state.group.claim?.claimantId ?? null

/** Readonly snapshot shape (from useSnapshot) accepted by the helpers. */
export type SyncSnapshot = Readonly<{
	role: SyncState['role']
	sessionId: SyncState['sessionId']
	deviceName: SyncState['deviceName']
	roomPeers: readonly PeerInfo[]
	group: Readonly<Pick<GroupState, 'claim' | 'media'>>
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

/** Label for the active player device ('Player offline' when absent). */
export const activePlayerLabel = (state: SyncSnapshot): string => {
	const playerName = activePlayerName(state)
	if (playerName && activePlayerOnline(state)) {
		return `Playing on ${playerName}`
	}
	return 'Player offline'
}

/** Shows the RemotePanel (controller UI) instead of the subtitle stage. */
export const isRemote = (state: SyncSnapshot): boolean =>
	state.role === 'peer' &&
	state.group.media !== null &&
	getActivePlayerId(state) !== state.sessionId

/** Renders the subtitle stage as the active player. */
export const isRenderer = (state: SyncSnapshot): boolean =>
	state.role === 'peer' && getActivePlayerId(state) === state.sessionId

/**
 * Should a freshly opened file be cast to the existing player rather than
 * played here? True when a live player exists and it isn't this device.
 */
export const isRemoteController = (state: SyncSnapshot): boolean =>
	state.role === 'peer' &&
	getActivePlayerId(state) !== state.sessionId &&
	activePlayerOnline(state)

/**
 * Inbound message types each role accepts. Constant: never mutated, so they
 * are safe to share across all `handleMessage` calls.
 */
const COORDINATOR_ALLOWED_MESSAGE_TYPES = new Set<SyncMessage['type']>([
	'group-propose',
	'device-state',
	'join',
	'leave',
	'request-file',
	'file-chunk',
	'ping',
	'pong',
])

/** Types a follower accepts from the coordinator. */
const FOLLOWER_ALLOWED_MESSAGE_TYPES = new Set<SyncMessage['type']>([
	'group-state',
	'device-state',
	'file-chunk',
	'request-file',
	'ping',
	'pong',
])

/** Types an ordinary peer accepts from another non-coordinator peer. */
const PEER_ALLOWED_MESSAGE_TYPES = new Set<SyncMessage['type']>([
	'group-state',
	'group-propose',
	'device-state',
	'request-file',
	'file-chunk',
	'ping',
	'pong',
])

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
	 * peer is already playing (a group-state with media/claim disarms this).
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
		syncState.settingsReady = true
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
	// Group document helpers
	// ------------------------------------------------------------------

	/** Snapshot the live group document (clock read from the local clock store). */
	private readGroupSnapshot(): GroupState {
		return {
			media: syncState.group.media ? { ...syncState.group.media } : null,
			claim: syncState.group.claim ? { ...syncState.group.claim } : null,
			clock: {
				isPlaying: clock.isPlaying,
				positionMs: getTimeElapsed(),
				playSpeed: clock.playSpeed,
			},
		}
	}

	/** Broadcast the full group document (claimant / default coordinator only). */
	broadcastGroupState() {
		if (!this.isCoordinator || syncState.connectionState !== 'connected') return
		this.send({ type: 'group-state', state: this.readGroupSnapshot() })
	}

	/** Alias kept for the file-transfer engine after a casted file arrives. */
	async announceFile() {
		this.broadcastGroupState()
		await this.broadcastDeviceState()
	}

	/** Gossip this device's library hashes (not subtitle bytes). */
	async broadcastDeviceState() {
		if (syncState.role !== 'peer') return
		const db = await initAndGetDb()
		const files = await db.getAll('files')
		this.send({
			type: 'device-state',
			library: files
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
		await this.broadcastDeviceState()
	}

	/** @deprecated clock-only name — broadcasts the full group snapshot. */
	broadcastClockState() {
		this.broadcastGroupState()
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
			this.broadcastGroupState()
		} else if (syncState.role !== 'none') {
			this.send({
				type: 'group-propose',
				op: { type: 'set-clock', positionMs: getTimeElapsed() },
			})
		}
	}

	togglePlayback() {
		const isPlaying = !clock.isPlaying
		toggleIsPlaying(isPlaying)
		if (this.isCoordinator) {
			this.broadcastGroupState()
		} else if (syncState.role !== 'none') {
			this.send({
				type: 'group-propose',
				op: { type: 'set-clock', isPlaying },
			})
		} else {
			void saveLocalProgress()
		}
	}

	setPlaySpeed(speed: number) {
		setClock({
			playSpeed: speed,
			lastActionAt: Date.now(),
			lastTimeElapsedMs: getTimeElapsed(),
		})
		if (this.isCoordinator) {
			this.broadcastGroupState()
		} else if (syncState.role !== 'none') {
			this.send({
				type: 'group-propose',
				op: { type: 'set-clock', playSpeed: speed },
			})
		}
	}

	/** While true, incoming group clock updates are ignored (timeline drag). */
	setScrubbing(scrubbing: boolean) {
		this.isScrubbing = scrubbing
	}

	// ------------------------------------------------------------------
	// Active player / group media mutations
	// ------------------------------------------------------------------

	/**
	 * Make this device the active player: claim coordination, optionally set
	 * group media, then broadcast the group document. The claim IS the player.
	 */
	async becomeActivePlayer(adoptFile?: PlayerFile) {
		if (syncState.role !== 'peer' || !syncState.sessionId) return
		// Claim unless we already hold the claim. Guarding on the claim (not on
		// `isCoordinator`) matters: the default coordinator (lowest id, no claim
		// yet) must still claim, or the derived player id stays null and this
		// device would render the remote panel instead of the player.
		if (syncState.group.claim?.claimantId !== syncState.sessionId) {
			syncState.group.claim = {
				term: (syncState.group.claim?.term ?? 0) + 1,
				claimantId: syncState.sessionId,
			}
		}
		if (adoptFile) {
			syncState.group.media = { hash: adoptFile.hash, name: adoptFile.name }
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

	/**
	 * Claim the player role if a file was opened before the device joined and
	 * nobody is playing yet (a group-state with claim/media disarms it).
	 */
	claimPendingPlayerFile(): PlayerFile | null {
		if (this.pendingPlayerFile && !syncState.group.claim) {
			const file = this.pendingPlayerFile
			this.pendingPlayerFile = null
			return file
		}
		return null
	}

	/**
	 * Pick which device renders. Selecting "this device" claims locally;
	 * selecting a peer asks it to claim (only the fenced claim in group-state
	 * changes who the player is).
	 */
	setPlayer(sessionId: string) {
		if (syncState.role !== 'peer') return
		if (sessionId === syncState.sessionId) {
			void this.becomeActivePlayer()
			return
		}
		if (!syncState.roomPeers.some((peer) => peer.sessionId === sessionId))
			return
		this.send({
			type: 'group-propose',
			op: { type: 'request-player', sessionId },
		})
	}

	/**
	 * Set the group's singular media. From a remote this proposes to the
	 * claimant; from the renderer it writes the group document directly.
	 */
	playFile(hash: string, name: string) {
		if (syncState.role !== 'peer') return
		if (this.isCoordinator) {
			void this._setGroupMedia(hash, name)
			return
		}
		this.send({
			type: 'group-propose',
			op: { type: 'set-media', hash, name },
		})
	}

	/**
	 * Resolve a file hash to the local copy when present; otherwise record it
	 * as unavailable and ask the group to transfer it.
	 */
	private async resolveNowPlayingFile(
		hash: string,
		name: string,
	): Promise<boolean> {
		const db = await initAndGetDb()
		const existing = (await db.getAll('files')).find((f) => f.hash === hash)
		if (existing) {
			syncState.nowPlayingFile = { fileId: existing.id, hash, name }
			return true
		}
		syncState.nowPlayingFile = { fileId: null, hash, name }
		this.send({ type: 'request-file', hash })
		return false
	}

	private async _setGroupMedia(hash: string, name: string) {
		if (!this.isCoordinator) return
		syncState.group.media = { hash, name }
		await this.resolveNowPlayingFile(hash, name)
		await this.announceFile()
	}

	// ------------------------------------------------------------------
	// Incoming messages
	// ------------------------------------------------------------------

	handleMessage(value: unknown, peerId: string) {
		if (!value || typeof value !== 'object' || Array.isArray(value)) return
		const msg = value as SyncMessage
		// group-state carries the fenced claim — accept before the role filter
		// so an electing peer can overturn a stale default coordinator.
		if (msg.type === 'group-state') {
			void this._handleGroupState(msg, peerId)
			return
		}
		const fromCoordinator = peerId === this.coordinatorId
		const allowedMessageTypes = this.isCoordinator
			? COORDINATOR_ALLOWED_MESSAGE_TYPES
			: fromCoordinator
				? FOLLOWER_ALLOWED_MESSAGE_TYPES
				: PEER_ALLOWED_MESSAGE_TYPES
		if (!allowedMessageTypes.has(msg.type)) return
		switch (msg.type) {
			case 'group-propose':
				this._handleGroupPropose(msg, peerId)
				return
			case 'device-state':
				this._handleDeviceStateMessage(msg)
				return
			case 'file-chunk':
				this._handleFileChunk(msg)
				return
			case 'request-file':
				this._handleRequestFile(msg, peerId)
				return
			case 'ping':
				this._handlePing(msg)
				return
			case 'join':
				void this.handlePeerJoin()
				return
			case 'leave':
				this._handlePeerLeave(msg.deviceName)
				return
		}
	}

	private async _handleGroupState(
		msg: Extract<SyncMessage, { type: 'group-state' }>,
		peerId: string,
	) {
		const incoming = msg.state
		if (
			!incoming ||
			typeof incoming !== 'object' ||
			!isValidGroupMedia(incoming.media) ||
			!isValidGroupClock(incoming.clock) ||
			(incoming.claim !== null && !isValidClaim(incoming.claim))
		)
			return

		const current = syncState.group.claim
		if (incoming.claim) {
			if (incoming.claim.claimantId !== peerId) return
			if (!claimIsSuperior(incoming.claim, current) && current) {
				// Inferior claim: re-assert ours so the peer can't stay split-brain.
				if (current.claimantId === syncState.sessionId) {
					void this.announceFile()
				}
				return
			}
			syncState.group.claim = {
				term: incoming.claim.term,
				claimantId: incoming.claim.claimantId,
			}
		} else if (current) {
			// Claimed group ignores claimless snapshots.
			if (current.claimantId === syncState.sessionId) {
				void this.announceFile()
			}
			return
		}

		// A peer published group media/claim — we're not taking the stage.
		if (incoming.media || incoming.claim) {
			this.pendingPlayerFile = null
		}

		const mediaChanged =
			(incoming.media?.hash ?? null) !==
				(syncState.group.media?.hash ?? null) ||
			(incoming.media?.name ?? null) !== (syncState.group.media?.name ?? null)

		syncState.group.media = incoming.media
			? { hash: incoming.media.hash, name: incoming.media.name }
			: null

		if (mediaChanged) {
			if (incoming.media) {
				await this.resolveNowPlayingFile(
					incoming.media.hash,
					incoming.media.name,
				).catch((err) => console.error('group media resolve failed', err))
			} else {
				syncState.nowPlayingFile = null
			}
		}

		this._applyClockState(incoming.clock)
	}

	private _handleGroupPropose(
		msg: Extract<SyncMessage, { type: 'group-propose' }>,
		peerId: string,
	) {
		const op = msg.op
		if (!op || typeof op !== 'object' || typeof op.type !== 'string') return

		if (op.type === 'request-player') {
			if (
				typeof op.sessionId !== 'string' ||
				op.sessionId !== syncState.sessionId
			)
				return
			if (Date.now() - (this.lastPlayerRequestAt.get(peerId) ?? 0) < 2000)
				return
			this.lastPlayerRequestAt.set(peerId, Date.now())
			void this.becomeActivePlayer()
			return
		}

		// Remaining ops are applied only by the current coordinator/claimant.
		if (!this.isCoordinator) return

		if (op.type === 'set-media') {
			if (
				typeof op.hash !== 'string' ||
				op.hash.length > 128 ||
				typeof op.name !== 'string' ||
				op.name.length > 256
			)
				return
			void this._setGroupMedia(op.hash, op.name)
			return
		}

		if (op.type === 'set-clock') {
			if (op.isPlaying !== undefined) {
				if (typeof op.isPlaying !== 'boolean') return
				if (op.isPlaying !== clock.isPlaying) toggleIsPlaying(op.isPlaying)
			}
			if (op.positionMs !== undefined) {
				if (!Number.isFinite(op.positionMs) || op.positionMs < 0) return
				setClock({
					lastActionAt: Date.now(),
					lastTimeElapsedMs: op.positionMs,
				})
			}
			if (op.playSpeed !== undefined) {
				if (
					!Number.isFinite(op.playSpeed) ||
					op.playSpeed < 0.1 ||
					op.playSpeed > 5
				)
					return
				setClock({
					playSpeed: op.playSpeed,
					lastActionAt: Date.now(),
					lastTimeElapsedMs: getTimeElapsed(),
				})
			}
			this.broadcastGroupState()
		}
	}

	private _handleDeviceStateMessage(
		msg: Extract<SyncMessage, { type: 'device-state' }>,
	) {
		if (
			!Array.isArray(msg.library) ||
			msg.library.length > 256 ||
			msg.library.some(
				(file) =>
					!file ||
					typeof file.hash !== 'string' ||
					file.hash.length > 128 ||
					typeof file.name !== 'string' ||
					file.name.length > 256,
			)
		)
			return
		// Peer answered our join with their library. No claim yet and nothing
		// playing => take the stage if we opened a file before connecting.
		const file = this.claimPendingPlayerFile()
		if (file) void this.becomeActivePlayer(file)
		void this.fileTransfer
			.handleDeviceLibrary(msg.library)
			.catch((err) => console.error('device-state handler failed', err))
	}

	private _handleRequestFile(
		msg: Extract<SyncMessage, { type: 'request-file' }>,
		peerId: string,
	) {
		if (typeof msg.hash !== 'string' || msg.hash.length > 128) return
		if (
			Date.now() - (this.fileTransfer.lastFileRequestAt.get(peerId) ?? 0) <
			2000
		)
			return
		this.fileTransfer.lastFileRequestAt.set(peerId, Date.now())
		void this.fileTransfer.sendFile(msg.hash)
	}

	private _handlePing(msg: Extract<SyncMessage, { type: 'ping' }>) {
		this.send({ type: 'pong', sentAt: msg.sentAt })
	}

	private _applyClockState(c: GroupClock) {
		if (this.isScrubbing) return
		setClock({ lastActionAt: Date.now(), lastTimeElapsedMs: c.positionMs })
		toggleIsPlaying(c.isPlaying)
		setClock({
			playSpeed: c.playSpeed,
			lastActionAt: Date.now(),
			lastTimeElapsedMs: getTimeElapsed(),
		})
	}

	async handlePeerJoin() {
		// A peer joined while we're the idle coordinator with a file open and
		// nobody playing: take the stage so the newcomer has something to see.
		const file = this.claimPendingPlayerFile()
		if (file) await this.becomeActivePlayer(file)
		// Push group + library so a newly joined device catches up.
		await this.announceFile()
	}

	private _handlePeerLeave(deviceName: string) {
		syncState.roomPeers = syncState.roomPeers.map((peer) =>
			peer.name === deviceName ? { ...peer, connected: false } : peer,
		)
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
				this.broadcastGroupState()
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
		syncState.group = emptyGroupState()
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
// Playback helpers (exported for the controls UI)
// ----------------------------------------------------------------------

export const seekBy = (deltaMs: number) => syncStore.seekBy(deltaMs)
export const seekTo = (positionMs: number) => syncStore.seekTo(positionMs)
export const togglePlayback = () => syncStore.togglePlayback()
export const setPlaySpeed = (speed: number) => syncStore.setPlaySpeed(speed)

let pagehideBound = false

/** Save solo progress when the tab is closing / backgrounded. */
export function ensureProgressPagehide() {
	if (pagehideBound || typeof window === 'undefined') return
	pagehideBound = true
	window.addEventListener('pagehide', () => {
		if (syncState.role !== 'none') return
		void saveLocalProgress()
	})
}
