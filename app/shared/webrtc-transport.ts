import type { SyncMessage, SyncState, PlayerFile } from './sync'

const API = '/api/sync'
const DC_NAME = 'subtitles'
const MAX_PRESENCE_RECONNECT_ATTEMPTS = 6

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

/** The subset of SyncEngine the transport talks back to. */
export interface TransportHost {
	send(msg: SyncMessage): void
	handleMessage(value: unknown, peerId: string): void
	readonly isCoordinator: boolean
	handlePeerJoin(): Promise<void>
	broadcastClockState(): void
	becomeActivePlayer(file?: PlayerFile): Promise<void>
	pendingPlayerFile: PlayerFile | null
	clearConnectTimeout(): void
}

const makeConnectionId = () =>
	[...crypto.getRandomValues(new Uint8Array(16))]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('')

/**
 * The WebRTC mesh: one full-duplex data channel per peer pair, plus the
 * presence WebSocket that the hibernatable Durable Object uses to relay only
 * SDP/ICE signaling. No payload (subtitles, clock) ever crosses the relay.
 */
export class WebRtcTransport {
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
	peerReconnectAttempts = new Map<string, number>()

	constructor(
		private host: TransportHost,
		private state: SyncState,
	) {}

	connectPresence(): Promise<void> {
		if (!this.state.roomCode || !this.state.sessionId) {
			return Promise.reject(new Error('Room transport is not ready'))
		}
		this.closePresenceSocket()
		this.presenceIntentionalClose = false
		const url = new URL(`${API}/room`, location.origin)
		url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
		url.searchParams.set('code', this.state.roomCode)
		url.searchParams.set('id', this.state.sessionId)
		url.searchParams.set('name', this.state.deviceName.slice(0, 64))

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
					void this.handleSignal(message).catch((err) =>
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
					this.state.role === 'peer' &&
					this.state.roomCode
				) {
					this.schedulePresenceReconnect()
				}
			}
		})
	}

	closePresenceSocket() {
		this.presenceIntentionalClose = true
		if (this.presenceReconnectTimer !== null) {
			window.clearTimeout(this.presenceReconnectTimer)
			this.presenceReconnectTimer = null
		}
		this.presenceSocket?.close(1000, 'Leaving room')
		this.presenceSocket = null
	}

	teardown() {
		this.closePresenceSocket()
		for (const dc of this.inboundDcs.values()) {
			dc.close()
		}
		this.inboundDcs.clear()
		for (const transport of this.peerTransports.values()) transport.pc.close()
		this.peerTransports.clear()
		this.earlyIce.clear()
		this.peerReconnectAttempts.clear()
		this.pc?.close()
		this.pc = null
	}

	private schedulePresenceReconnect() {
		if (this.presenceReconnectTimer !== null) return
		if (this.presenceReconnectAttempts >= MAX_PRESENCE_RECONNECT_ATTEMPTS) {
			if (this.state.connectionState !== 'connected') {
				this.state.connectionState = 'error'
				this.state.error = 'Could not reconnect directly to the other device'
			}
			return
		}
		const attempt = this.presenceReconnectAttempts++
		const delay = Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 500
		this.presenceReconnectTimer = window.setTimeout(() => {
			this.presenceReconnectTimer = null
			void this.connectPresence().catch(() => {})
		}, delay)
	}

	private sendSignal(message: Record<string, unknown>) {
		if (this.presenceSocket?.readyState === WebSocket.OPEN)
			this.presenceSocket.send(JSON.stringify(message))
	}

	private monitorConnection(pc: RTCPeerConnection, peerId: string) {
		pc.onconnectionstatechange = () => {
			if (pc.connectionState === 'connected') {
				this.peerReconnectAttempts.set(peerId, 0)
				this.state.connectionState = 'connected'
				this.presenceReconnectAttempts = 0
				this.host.clearConnectTimeout()
				if (this.state.sessionId && this.state.sessionId > peerId)
					this.sendSignal({
						type: 'ready',
						to: peerId,
						generation:
							this.peerTransports.get(peerId)?.generation ?? makeConnectionId(),
					})
			}
			if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
				const transport = this.peerTransports.get(peerId)
				if (transport?.pc === pc) this.peerTransports.delete(peerId)
				this.state.roomPeers = this.state.roomPeers.map((peer) =>
					peer.sessionId === peerId ? { ...peer, connected: false } : peer,
				)
				const retries = this.peerReconnectAttempts.get(peerId) ?? 0
				if (
					retries < 3 &&
					!this.presenceIntentionalClose &&
					this.state.roomCode
				) {
					this.peerReconnectAttempts.set(peerId, retries + 1)
					this.schedulePresenceReconnect()
				}
			}
		}
	}

	private attachDataChannel(dc: RTCDataChannel, peerId: string) {
		dc.onmessage = (event) => {
			try {
				if (typeof event.data !== 'string' || event.data.length > 64 * 1024)
					return
				this.host.handleMessage(JSON.parse(event.data), peerId)
			} catch (err) {
				console.warn('Ignoring malformed sync message', err)
			}
		}
		dc.onopen = () => {
			this.inboundDcs.set(peerId, dc)
			this.state.roomPeers = this.state.roomPeers.map((peer) =>
				peer.sessionId === peerId ? { ...peer, connected: true } : peer,
			)
			if (this.state.coordinationClaim?.claimantId === this.state.sessionId)
				dc.send(
					JSON.stringify({
						type: 'claim-coordinator',
						...this.state.coordinationClaim,
					}),
				)
			this.host.send({ type: 'join', deviceName: this.state.deviceName })
			if (this.host.isCoordinator) void this.host.handlePeerJoin()
		}
		dc.onclose = () => {
			if (this.inboundDcs.get(peerId) === dc) this.inboundDcs.delete(peerId)
		}
	}

	private newPeer(peerId: string, generation: string): PeerTransport {
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
		this.monitorConnection(pc, peerId)
		pc.onicecandidate = (event) => {
			if (event.candidate)
				this.sendSignal({
					type: 'ice',
					to: peerId,
					generation,
					candidates: [event.candidate.toJSON()],
				})
		}
		return transport
	}

	private async offerPeer(peerId: string) {
		const generation = makeConnectionId()
		const transport = this.newPeer(peerId, generation)
		const dc = transport.pc.createDataChannel(DC_NAME)
		this.attachDataChannel(dc, peerId)
		await transport.pc.setLocalDescription(await transport.pc.createOffer())
		this.sendSignal({
			type: 'offer',
			to: peerId,
			generation,
			sdp: transport.pc.localDescription,
		})
	}

	private async handleSignal(message: SignalMessage) {
		if (message.type === 'peers') {
			const wasCoordinator = this.host.isCoordinator
			const signaled = message.peers
				.filter((peer) => peer.id !== this.state.sessionId)
				.map((peer) => ({
					sessionId: peer.id,
					name: peer.name,
					connected: this.inboundDcs.get(peer.id)?.readyState === 'open',
				}))
			this.state.roomPeers = signaled
			if (
				this.state.coordinationClaim &&
				this.state.coordinationClaim.claimantId !== this.state.sessionId &&
				!signaled.some(
					(peer) => peer.sessionId === this.state.coordinationClaim?.claimantId,
				)
			) {
				this.state.coordinationClaim = null
			}
			if (!wasCoordinator && this.host.isCoordinator) {
				this.host.broadcastClockState()
			}
			// Solo group with a file open and nobody playing: take the stage.
			if (
				this.state.roomPeers.length === 0 &&
				this.host.pendingPlayerFile &&
				!this.state.coordinationClaim
			) {
				const file = this.host.pendingPlayerFile
				this.host.pendingPlayerFile = null
				void this.host.becomeActivePlayer(file)
			}
			for (const peer of message.peers)
				if (
					this.state.sessionId &&
					this.state.sessionId < peer.id &&
					!this.peerTransports.has(peer.id)
				)
					void this.offerPeer(peer.id)
			return
		}
		if (
			message.type === 'offer' &&
			this.state.sessionId &&
			message.from < this.state.sessionId
		) {
			const transport = this.newPeer(message.from, message.generation)
			transport.pc.ondatachannel = (event) =>
				this.attachDataChannel(event.channel, message.from)
			await transport.pc.setRemoteDescription(message.sdp)
			for (const ice of transport.pendingIce.splice(0))
				await transport.pc.addIceCandidate(ice)
			await transport.pc.setLocalDescription(await transport.pc.createAnswer())
			this.sendSignal({
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
}
