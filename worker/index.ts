import { Hono } from 'hono'

/**
 * Signaling endpoint for device pairing.
 *
 * This worker ONLY brokers WebRTC session discovery for Cloudflare
 * Realtime SFU. It never touches subtitle content: the only data that
 * passes through here are opaque, ephemeral SFU session IDs and device
 * names. SRT data travels exclusively over the WebRTC data channel.
 *
 * Routes:
 *   /api/sync/sfu/*                      -> transparent proxy to the SFU API
 *   POST /api/sync?action=register-room { code, sessionId, name }  (host device)
 *   POST /api/sync?action=register-peer  { code, sessionId, name } (paired device)
 *   GET  /api/sync?action=lookup-room&code=XYZ -> { hostSessionId, name, peers }
 *   POST /api/sync?action=remove-peer    { code, sessionId }       (unpair)
 *   * -> static assets (SPA)
 *
 * Note: the room registry is in-memory and resets on cold start. The
 * pairing code itself lives on the device, so reactivating after a
 * restart still works as long as this worker instance is warm.
 */

interface Env {
	APP_ID: string
	APP_TOKEN: string
	ASSETS: Fetcher
}

interface Peer {
	sessionId: string
	name: string
	joinedAt: number
}

interface Room {
	hostSessionId: string
	name: string
	peers: Peer[]
	createdAt: number
}

interface SyncBody {
	code?: string
	sessionId?: string
	name?: string
}

const API_BASE = 'https://rtc.live.cloudflare.com/v1/apps'

/** Best-effort in-memory registry; the QR code is the primary join path. */
const rooms = new Map<string, Room>()

const app = new Hono<{ Bindings: Env }>()

app.all('/api/sync', async (c) => {
	const action = c.req.query('action')

	if (!action) {
		return c.json({ error: 'Not found' }, 404)
	}

	const body =
		c.req.method === 'GET'
			? null
			: ((await c.req.json<SyncBody>().catch(() => null)) as SyncBody | null)
	const codeFromQuery = c.req.query('code')?.trim().toUpperCase()
	const roomCode = body?.code?.trim().toUpperCase() ?? codeFromQuery

	if (c.req.method === 'POST' && action === 'register-room') {
		if (!roomCode || !body?.sessionId) {
			return c.json({ error: 'Missing code or sessionId' }, 400)
		}
		rooms.set(roomCode, {
			hostSessionId: body.sessionId,
			name: body.name ?? 'Group',
			peers: [
				{
					sessionId: body.sessionId,
					name: body.name ?? 'Group',
					joinedAt: Date.now(),
				},
			],
			createdAt: Date.now(),
		})
		return c.json({ ok: true })
	}

	if (c.req.method === 'POST' && action === 'register-peer') {
		if (!roomCode || !body?.sessionId) {
			return c.json({ error: 'Missing code or sessionId' }, 400)
		}
		const room = rooms.get(roomCode)
		if (!room) {
			return c.json({ error: 'Room not found' }, 404)
		}
		if (!room.peers.some((peer) => peer.sessionId === body.sessionId)) {
			room.peers.push({
				sessionId: body.sessionId,
				name: body.name ?? 'Device',
				joinedAt: Date.now(),
			})
		}
		return c.json({ ok: true })
	}

	if (c.req.method === 'GET' && action === 'lookup-room') {
		if (!roomCode) {
			return c.json({ error: 'Missing code' }, 400)
		}
		const room = rooms.get(roomCode)
		if (!room) {
			return c.json({ error: 'Room not found' }, 404)
		}
		return c.json({
			hostSessionId: room.hostSessionId,
			name: room.name,
			peers: room.peers,
		})
	}

	if (c.req.method === 'POST' && action === 'remove-peer') {
		if (!roomCode || !body?.sessionId) {
			return c.json({ error: 'Missing code or sessionId' }, 400)
		}
		const room = rooms.get(roomCode)
		if (room) {
			room.peers = room.peers.filter(
				(peer) => peer.sessionId !== body.sessionId,
			)
			if (room.peers.length === 0) {
				rooms.delete(roomCode)
			}
		}
		return c.json({ ok: true })
	}

	return c.json({ error: 'Unknown action' }, 400)
})

// Transparent proxy for the SFU API. The app token never leaves the
// server; clients talk to /api/sync/sfu/... only.
app.all('/api/sync/sfu/*', async (c) => {
	const sfuPath = c.req.path.replace(/^\/api\/sync\/sfu/, '')
	if (!sfuPath.startsWith('/sessions')) {
		return c.json({ error: 'Not found' }, 404)
	}
	const request = c.req.raw
	const response = await fetch(`${API_BASE}/${c.env.APP_ID}${sfuPath}`, {
		method: request.method,
		headers: {
			Authorization: `Bearer ${c.env.APP_TOKEN}`,
			'Content-Type': 'application/json',
		},
		body: request.body,
	})
	return new Response(response.body, {
		status: response.status,
		headers: { 'Content-Type': 'application/json' },
	})
})

// Serve the SPA for everything else.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
