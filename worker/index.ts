import { Hono } from 'hono'
import { RoomCoordinator } from './room-coordinator'

export { RoomCoordinator } from './room-coordinator'

/**
 * Signaling endpoint for device pairing.
 *
 * This worker relays bounded SDP/ICE signaling. SRT and playback data travel
 * only over direct WebRTC channels.
 *
 * Room presence is coordinated by one hibernatable Durable Object per
 * room code. Idle WebSockets do not keep an object running, and all SRT
 * and clock data remains on peer-to-peer data channels.
 */

interface Env {
	ASSETS: Fetcher
	ROOMS: DurableObjectNamespace<RoomCoordinator>
	SYNC_RATE_LIMITER: RateLimit
}

const ROOM_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{20}$/

const app = new Hono<{ Bindings: Env }>()

const allowSyncRequest = async (request: Request, env: Env) => {
	const client = request.headers.get('CF-Connecting-IP') ?? 'unknown'
	return (await env.SYNC_RATE_LIMITER.limit({ key: client })).success
}

app.get('/api/sync/room', async (c) => {
	if (!(await allowSyncRequest(c.req.raw, c.env))) {
		return c.json({ error: 'Too many requests' }, 429)
	}
	const roomCode = c.req.query('code')?.trim().toUpperCase() ?? ''
	if (!ROOM_CODE_RE.test(roomCode)) {
		return c.json({ error: 'Not found' }, 404)
	}
	const origin = c.req.header('Origin')
	if (origin !== new URL(c.req.url).origin) {
		return c.json({ error: 'Forbidden' }, 403)
	}
	return await c.env.ROOMS.getByName(roomCode).fetch(c.req.raw)
})

// Serve the SPA for everything else.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
