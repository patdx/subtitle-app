import { DurableObject } from 'cloudflare:workers'

const MAX_CONNECTIONS = 5
const MAX_MESSAGE_BYTES = 32 * 1024
const MAX_ICE_MESSAGES = 256
const MAX_SIGNAL_MESSAGES = 320
const ID_RE = /^[A-Fa-f0-9]{32}$/

interface Attachment {
	id: string
	name: string
	iceMessages: number
	signalMessages: number
}

const attachment = (ws: WebSocket): Attachment | null => {
	const value: unknown = ws.deserializeAttachment()
	if (!value || typeof value !== 'object') return null
	const item = value as Partial<Attachment>
	if (!ID_RE.test(item.id ?? '')) return null
	return {
		id: item.id!,
		name: typeof item.name === 'string' ? item.name : 'Device',
		iceMessages: typeof item.iceMessages === 'number' ? item.iceMessages : 0,
		signalMessages:
			typeof item.signalMessages === 'number' ? item.signalMessages : 0,
	}
}

export class RoomCoordinator extends DurableObject<Record<string, never>> {
	async fetch(request: Request): Promise<Response> {
		if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
			return new Response('Upgrade required', { status: 426 })
		const url = new URL(request.url)
		const id = url.searchParams.get('id') ?? ''
		const rawName = url.searchParams.get('name') ?? ''
		if (!ID_RE.test(id) || rawName.length > 64)
			return new Response('Invalid connection', { status: 400 })

		const sockets = this.activeSockets()
		if (sockets.some(({ state }) => state.id === id))
			return new Response('Duplicate connection', { status: 409 })
		if (sockets.length >= MAX_CONNECTIONS)
			return new Response('Group full', { status: 429 })

		const pair = new WebSocketPair()
		const state: Attachment = {
			id,
			name: rawName.trim() || 'Device',
			iceMessages: 0,
			signalMessages: 0,
		}
		pair[1].serializeAttachment(state)
		this.ctx.acceptWebSocket(pair[1])
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
		}
		if (
			!['offer', 'answer', 'ice', 'ready', 'cancel'].includes(msg.type ?? '') ||
			!ID_RE.test(msg.to ?? '') ||
			!ID_RE.test(msg.generation ?? '') ||
			msg.to === sender.id
		)
			return ws.close(1008, 'Invalid signal')
		if (++sender.signalMessages > MAX_SIGNAL_MESSAGES)
			return ws.close(1008, 'Too many signals')
		if (msg.type === 'ice' && ++sender.iceMessages > MAX_ICE_MESSAGES)
			return ws.close(1008, 'Too many candidates')
		ws.serializeAttachment(sender)

		const target = this.activeSockets().find(({ state }) => state.id === msg.to)
		if (!target) return ws.close(1008, 'Invalid target')
		if (
			(msg.type === 'offer' && sender.id > target.state.id) ||
			((msg.type === 'answer' || msg.type === 'ready') &&
				sender.id < target.state.id)
		)
			return ws.close(1008, 'Invalid negotiation direction')
		target.ws.send(JSON.stringify({ ...parsed, from: sender.id }))
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
					!!item.state,
			)
	}

	private sendPeers(exclude?: WebSocket) {
		const peers = this.activeSockets()
			.filter(({ ws }) => ws !== exclude)
			.map(({ state }) => ({ id: state.id, name: state.name }))
		const message = JSON.stringify({ type: 'peers', peers })
		for (const { ws } of this.activeSockets())
			if (ws !== exclude) ws.send(message)
	}

	private remove(ws: WebSocket) {
		const state = attachment(ws)
		if (!state) return
		this.sendPeers(ws)
	}
}
