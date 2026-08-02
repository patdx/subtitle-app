import { DurableObject } from 'cloudflare:workers'

const MAX_ROOM_CONNECTIONS = 8
const MAX_NAME_LENGTH = 64
const SESSION_ID_RE = /^[A-Za-z0-9_-]{16,128}$/
const HOST_TOKEN_RE = /^host\.([A-Fa-f0-9]{64})$/

export type RoomRole = 'host' | 'follower'

export interface RoomPeer {
	sessionId: string
	name: string
	isHost: boolean
}

interface SocketAttachment extends RoomPeer {
	superseded?: boolean
}

export interface RoomSnapshot {
	hostSessionId: string
	peers: RoomPeer[]
}

const socketAttachment = (socket: WebSocket): SocketAttachment | null => {
	const value: unknown = socket.deserializeAttachment()
	if (!value || typeof value !== 'object') return null
	const peer = value as Partial<SocketAttachment>
	if (
		typeof peer.sessionId !== 'string' ||
		typeof peer.name !== 'string' ||
		typeof peer.isHost !== 'boolean'
	) {
		return null
	}
	return {
		sessionId: peer.sessionId,
		name: peer.name,
		isHost: peer.isHost,
		superseded: peer.superseded === true,
	}
}

export class RoomCoordinator extends DurableObject<Record<string, never>> {
	getSnapshot(): RoomSnapshot | null {
		const peers = this.peers()
		const host = peers.find((peer) => peer.isHost)
		return host ? { hostSessionId: host.sessionId, peers } : null
	}

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
			return Response.json(
				{ error: 'WebSocket upgrade required' },
				{ status: 426 },
			)
		}

		const url = new URL(request.url)
		const role = url.searchParams.get('role')
		const sessionId = url.searchParams.get('sessionId') ?? ''
		const rawName = url.searchParams.get('name') ?? ''
		const name = rawName.trim().slice(0, MAX_NAME_LENGTH) || 'Device'
		if (
			(role !== 'host' && role !== 'follower') ||
			!SESSION_ID_RE.test(sessionId) ||
			rawName.length > MAX_NAME_LENGTH
		) {
			return Response.json(
				{ error: 'Invalid room connection' },
				{ status: 400 },
			)
		}

		const sockets = this.ctx.getWebSockets()
		const active = sockets
			.map((socket) => ({ socket, peer: socketAttachment(socket) }))
			.filter(
				(entry): entry is { socket: WebSocket; peer: SocketAttachment } =>
					entry.peer !== null && !entry.peer.superseded,
			)
		const host = active.find(({ peer }) => peer.isHost)
		const hostToken = request.headers
			.get('Sec-WebSocket-Protocol')
			?.split(',')
			.map((value) => value.trim())
			.find((value) => HOST_TOKEN_RE.test(value))

		if (role === 'host') {
			if (!hostToken) {
				return Response.json(
					{ error: 'Missing host credential' },
					{ status: 401 },
				)
			}
			const tokenHash = await sha256(hostToken)
			const ownerHash = await this.ctx.storage.get<string>('ownerTokenHash')
			if (ownerHash && ownerHash !== tokenHash) {
				return Response.json(
					{ error: 'Room owner credential rejected' },
					{ status: 403 },
				)
			}
			if (!ownerHash) await this.ctx.storage.put('ownerTokenHash', tokenHash)
			if (host) {
				if (!this.ctx.getTags(host.socket).includes(hostToken)) {
					return Response.json(
						{ error: 'Room already has a host' },
						{ status: 409 },
					)
				}
				host.peer.superseded = true
				host.socket.serializeAttachment(host.peer)
				host.socket.close(1000, 'Replaced by reconnect')
			}
		} else if (!host) {
			return Response.json({ error: 'Room not found' }, { status: 404 })
		}

		const duplicate = active.find(({ peer }) => peer.sessionId === sessionId)
		if (duplicate && duplicate !== host) {
			return Response.json(
				{ error: 'Session already connected' },
				{ status: 409 },
			)
		}
		if (active.length - (duplicate ? 1 : 0) >= MAX_ROOM_CONNECTIONS) {
			return Response.json({ error: 'Room is full' }, { status: 429 })
		}

		const pair = new WebSocketPair()
		const client = pair[0]
		const server = pair[1]
		const peer: SocketAttachment = { sessionId, name, isHost: role === 'host' }
		server.serializeAttachment(peer)
		this.ctx.acceptWebSocket(
			server,
			role === 'host' && hostToken ? ['host', hostToken] : ['follower'],
		)
		this.broadcastSnapshot()

		return new Response(null, {
			status: 101,
			webSocket: client,
			headers: { 'Sec-WebSocket-Protocol': 'subtitle-sync' },
		})
	}

	webSocketMessage(socket: WebSocket): void {
		// Presence is server-driven. Closing clients that send application data
		// prevents this socket from becoming an unbounded relay or wake-up source.
		socket.close(1008, 'Client messages are not accepted')
	}

	webSocketClose(socket: WebSocket): void {
		this.removeSocket(socket)
	}

	webSocketError(socket: WebSocket): void {
		this.removeSocket(socket)
	}

	private peers(exclude?: WebSocket): RoomPeer[] {
		return this.ctx
			.getWebSockets()
			.filter((socket) => socket !== exclude)
			.map(socketAttachment)
			.filter(
				(peer): peer is SocketAttachment => peer !== null && !peer.superseded,
			)
			.map(({ sessionId, name, isHost }) => ({ sessionId, name, isHost }))
	}

	private broadcastSnapshot(exclude?: WebSocket): void {
		const peers = this.peers(exclude)
		const host = peers.find((peer) => peer.isHost)
		const snapshot = host ? { hostSessionId: host.sessionId, peers } : null
		if (!snapshot) return
		const message = JSON.stringify({ type: 'snapshot', ...snapshot })
		for (const socket of this.ctx.getWebSockets()) {
			const peer = socketAttachment(socket)
			if (!peer?.superseded) socket.send(message)
		}
	}

	private removeSocket(socket: WebSocket): void {
		const departed = socketAttachment(socket)
		if (!departed || departed.superseded) return
		if (departed.isHost) {
			for (const follower of this.ctx.getWebSockets('follower')) {
				follower.close(1001, 'Host left')
			}
			return
		}
		this.broadcastSnapshot(socket)
	}
}

const sha256 = async (value: string): Promise<string> => {
	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(value),
	)
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('')
}
