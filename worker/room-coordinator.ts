import { DurableObject } from 'cloudflare:workers'

const MAX_CONNECTIONS = 8
const MAX_MESSAGE_BYTES = 32 * 1024
const MAX_FOLLOWER_ICE_MESSAGES = 64
const MAX_FOLLOWER_SIGNAL_MESSAGES = 80
const MAX_HOST_ICE_MESSAGES = 384
const MAX_HOST_SIGNAL_MESSAGES = 512
const ID_RE = /^[A-Fa-f0-9]{32}$/
const HOST_TOKEN_RE = /^host\.([A-Fa-f0-9]{64})$/

type Role = 'host' | 'follower'
interface Attachment {
	id: string
	role: Role
	name: string
	iceMessages: number
	signalMessages: number
	negotiated?: boolean
	superseded?: boolean
}

const attachment = (ws: WebSocket): Attachment | null => {
	const value: unknown = ws.deserializeAttachment()
	if (!value || typeof value !== 'object') return null
	const item = value as Partial<Attachment>
	if (
		!ID_RE.test(item.id ?? '') ||
		(item.role !== 'host' && item.role !== 'follower')
	)
		return null
	return {
		id: item.id!,
		role: item.role,
		name: typeof item.name === 'string' ? item.name : 'Device',
		iceMessages: typeof item.iceMessages === 'number' ? item.iceMessages : 0,
		signalMessages:
			typeof item.signalMessages === 'number' ? item.signalMessages : 0,
		superseded: item.superseded === true,
		negotiated: item.negotiated === true,
	}
}

export class RoomCoordinator extends DurableObject<Record<string, never>> {
	async fetch(request: Request): Promise<Response> {
		if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
			return new Response('Upgrade required', { status: 426 })
		const url = new URL(request.url)
		const role = url.searchParams.get('role') as Role | null
		const id = url.searchParams.get('id') ?? ''
		const rawName = url.searchParams.get('name') ?? ''
		if (
			(role !== 'host' && role !== 'follower') ||
			!ID_RE.test(id) ||
			rawName.length > 64
		)
			return new Response('Invalid connection', { status: 400 })

		const hostToken = request.headers
			.get('Sec-WebSocket-Protocol')
			?.split(',')
			.map((v) => v.trim())
			.find((v) => HOST_TOKEN_RE.test(v))
		if (role === 'host') {
			if (!hostToken)
				return new Response('Missing owner credential', { status: 401 })
			const hash = await sha256(hostToken)
			const authorized = await this.ctx.storage.transaction(async (txn) => {
				const current = await txn.get<string>('ownerTokenHash')
				if (current && current !== hash) return false
				if (!current) await txn.put('ownerTokenHash', hash)
				return true
			})
			if (!authorized)
				return new Response('Owner credential rejected', { status: 403 })
		}

		let sockets = this.activeSockets()
		const host = sockets.find(({ state }) => state.role === 'host')
		if (role === 'follower' && !host)
			return new Response('Room not found', { status: 404 })
		if (role === 'host' && host) {
			if (!hostToken || !this.ctx.getTags(host.ws).includes(hostToken))
				return new Response('Room already hosted', { status: 409 })
			host.state.superseded = true
			host.ws.serializeAttachment(host.state)
			host.ws.close(1000, 'Host reconnected')
			sockets = this.activeSockets()
		}
		if (sockets.some(({ state }) => state.id === id))
			return new Response('Duplicate connection', { status: 409 })
		if (sockets.length >= MAX_CONNECTIONS)
			return new Response('Room full', { status: 429 })

		const pair = new WebSocketPair()
		const state: Attachment = {
			id,
			role,
			name: rawName.trim() || 'Device',
			iceMessages: 0,
			signalMessages: 0,
		}
		pair[1].serializeAttachment(state)
		this.ctx.acceptWebSocket(
			pair[1],
			role === 'host' && hostToken ? [role, hostToken] : [role],
		)
		this.sendPeers()
		return new Response(null, {
			status: 101,
			webSocket: pair[0],
			headers: { 'Sec-WebSocket-Protocol': 'subtitle-sync' },
		})
	}

	webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): void {
		if (
			typeof raw !== 'string' ||
			raw.length > MAX_MESSAGE_BYTES ||
			new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES
		)
			return ws.close(1009, 'Invalid message')
		const sender = attachment(ws)
		if (!sender) return ws.close(1008, 'Invalid sender')
		let parsed: unknown
		try {
			parsed = JSON.parse(raw)
		} catch {
			return ws.close(1007, 'Invalid JSON')
		}
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
			return ws.close(1008, 'Invalid signal')
		const msg = parsed as {
			type?: string
			to?: string
			generation?: string
			sdp?: unknown
			candidates?: unknown
		}
		if (
			!['offer', 'answer', 'ice', 'ready', 'cancel'].includes(msg.type ?? '') ||
			!ID_RE.test(msg.to ?? '') ||
			!ID_RE.test(msg.generation ?? '')
		)
			return ws.close(1008, 'Invalid signal')
		const maxSignals =
			sender.role === 'host'
				? MAX_HOST_SIGNAL_MESSAGES
				: MAX_FOLLOWER_SIGNAL_MESSAGES
		if (++sender.signalMessages > maxSignals)
			return ws.close(1008, 'Too many signals')
		if (msg.type === 'ice') {
			const maxIce =
				sender.role === 'host'
					? MAX_HOST_ICE_MESSAGES
					: MAX_FOLLOWER_ICE_MESSAGES
			if (++sender.iceMessages > maxIce)
				return ws.close(1008, 'Too many candidates')
		}
		if (
			(msg.type === 'offer' && sender.role !== 'host') ||
			((msg.type === 'answer' || msg.type === 'ready') &&
				sender.role !== 'follower')
		)
			return ws.close(1008, 'Invalid signal direction')
		ws.serializeAttachment(sender)
		const target = this.activeSockets().find(({ state }) => state.id === msg.to)
		if (!target || target.state.role === sender.role)
			return ws.close(1008, 'Invalid target')
		target.ws.send(JSON.stringify({ ...msg, from: sender.id }))
		if (msg.type === 'ready' && sender.role === 'follower') {
			sender.negotiated = true
			ws.serializeAttachment(sender)
			ws.close(1000, 'P2P connected')
		}
	}

	webSocketClose(ws: WebSocket): void {
		this.remove(ws)
	}
	webSocketError(ws: WebSocket): void {
		this.remove(ws)
	}

	private activeSockets() {
		return this.ctx
			.getWebSockets()
			.map((ws) => ({ ws, state: attachment(ws) }))
			.filter(
				(item): item is { ws: WebSocket; state: Attachment } =>
					!!item.state && !item.state.superseded,
			)
	}
	private sendPeers(exclude?: WebSocket) {
		const peers = this.activeSockets()
			.filter(({ ws }) => ws !== exclude)
			.map(({ state }) => ({
				id: state.id,
				name: state.name,
				isHost: state.role === 'host',
			}))
		const message = JSON.stringify({ type: 'peers', peers })
		for (const { ws } of this.activeSockets())
			if (ws !== exclude) ws.send(message)
	}
	private remove(ws: WebSocket) {
		const state = attachment(ws)
		if (!state || state.superseded) return
		if (state.negotiated) return
		if (state.role === 'host')
			for (const follower of this.ctx.getWebSockets('follower'))
				follower.close(1001, 'Host left')
		else this.sendPeers(ws)
	}
}

const sha256 = async (value: string) =>
	[
		...new Uint8Array(
			await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
		),
	]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
