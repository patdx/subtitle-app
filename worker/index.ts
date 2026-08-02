import { Hono } from 'hono'
import { RoomCoordinator, type RoomSnapshot } from './room-coordinator'

export { RoomCoordinator } from './room-coordinator'

/**
 * Signaling endpoint for device pairing.
 *
 * This worker ONLY brokers WebRTC session discovery for Cloudflare
 * Realtime SFU. It never touches subtitle content: the only data that
 * passes through here are opaque, ephemeral SFU session IDs and device
 * names. SRT data travels exclusively over the WebRTC data channel.
 *
 * Room presence is coordinated by one hibernatable Durable Object per
 * room code. Idle WebSockets do not keep an object running, and all SRT
 * and clock data remains on Realtime SFU data channels.
 */

interface Env {
	APP_ID: string
	APP_TOKEN: string
	ASSETS: Fetcher
	ROOMS: DurableObjectNamespace<RoomCoordinator>
	SYNC_RATE_LIMITER: RateLimit
}

const API_BASE = 'https://rtc.live.cloudflare.com/v1/apps'
const ROOM_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/
const MAX_SFU_BODY_BYTES = 64 * 1024
const SFU_ROUTES = [
	{ method: 'POST', pattern: /^\/sessions\/new$/ },
	{
		method: 'POST',
		pattern:
			/^\/sessions\/[A-Za-z0-9_-]{16,128}\/datachannels\/(?:new|establish)$/,
	},
	{
		method: 'PUT',
		pattern: /^\/sessions\/[A-Za-z0-9_-]{16,128}\/renegotiate$/,
	},
] as const

const app = new Hono<{ Bindings: Env }>()

const allowSyncRequest = async (request: Request, env: Env) => {
	const client = request.headers.get('CF-Connecting-IP') ?? 'unknown'
	return (await env.SYNC_RATE_LIMITER.limit({ key: client })).success
}

app.get('/api/sync', async (c) => {
	if (!(await allowSyncRequest(c.req.raw, c.env))) {
		return c.json({ error: 'Too many requests' }, 429)
	}
	const action = c.req.query('action')
	const roomCode = c.req.query('code')?.trim().toUpperCase() ?? ''
	if (action !== 'lookup-room' || !ROOM_CODE_RE.test(roomCode)) {
		return c.json({ error: 'Not found' }, 404)
	}
	const room = (await c.env.ROOMS.getByName(
		roomCode,
	).getSnapshot()) as RoomSnapshot | null
	return room ? c.json(room) : c.json({ error: 'Room not found' }, 404)
})

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

// Transparent proxy for the SFU API. The app token never leaves the
// server; clients talk to /api/sync/sfu/... only.
app.all('/api/sync/sfu/*', async (c) => {
	if (!(await allowSyncRequest(c.req.raw, c.env))) {
		return c.json({ error: 'Too many requests' }, 429)
	}
	const sfuPath = c.req.path.replace(/^\/api\/sync\/sfu/, '')
	if (
		!SFU_ROUTES.some(
			(route) => route.method === c.req.method && route.pattern.test(sfuPath),
		)
	) {
		return c.json({ error: 'Not found' }, 404)
	}
	const origin = c.req.header('Origin')
	if (origin && origin !== new URL(c.req.url).origin) {
		return c.json({ error: 'Forbidden' }, 403)
	}
	const contentLength = Number(c.req.header('Content-Length'))
	const createsSession = c.req.method === 'POST' && sfuPath === '/sessions/new'
	if (
		(!createsSession &&
			c.req.header('Content-Type')?.split(';', 1)[0] !== 'application/json') ||
		!Number.isSafeInteger(contentLength) ||
		contentLength < 0 ||
		contentLength > MAX_SFU_BODY_BYTES
	) {
		return c.json({ error: 'Invalid request body' }, 413)
	}
	if (!c.env.APP_TOKEN) {
		return c.json(
			{ error: 'SFU token not configured (missing APP_TOKEN secret)' },
			500,
		)
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
