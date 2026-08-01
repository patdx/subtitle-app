/**
 * Signaling endpoint for device pairing.
 *
 * This function ONLY brokers WebRTC session discovery for Cloudflare
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
 *
 * Note: the room registry is in-memory and resets on cold start. The
 * pairing code itself lives on the device, so reactivating after a
 * restart still works as long as this function instance is warm.
 */

interface Env {
	APP_ID: string
	APP_TOKEN: string
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

const API_BASE = 'https://rtc.live.cloudflare.com/v1/apps'

/** Best-effort in-memory registry; the QR code is the primary join path. */
const rooms = new Map<string, Room>()

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
	const url = new URL(request.url)
	const action = url.searchParams.get('action')

	if (action) {
		const codeFromQuery = url.searchParams.get('code')?.trim().toUpperCase()
		const body = (request.method !== 'GET'
			? ((await request.json().catch(() => null)) as {
					code?: string
					sessionId?: string
					name?: string
			  } | null)
			: null) as { code?: string; sessionId?: string; name?: string } | null

		const roomCode = body?.code?.trim().toUpperCase() ?? codeFromQuery

		if (request.method === 'POST' && action === 'register-room') {
			if (!roomCode || !body?.sessionId) {
				return Response.json(
					{ error: 'Missing code or sessionId' },
					{ status: 400 },
				)
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
			return Response.json({ ok: true })
		}

		if (request.method === 'POST' && action === 'register-peer') {
			if (!roomCode || !body?.sessionId) {
				return Response.json(
					{ error: 'Missing code or sessionId' },
					{ status: 400 },
				)
			}
			const room = rooms.get(roomCode)
			if (!room) {
				return Response.json({ error: 'Room not found' }, { status: 404 })
			}
			if (!room.peers.some((peer) => peer.sessionId === body.sessionId)) {
				room.peers.push({
					sessionId: body.sessionId,
					name: body.name ?? 'Device',
					joinedAt: Date.now(),
				})
			}
			return Response.json({ ok: true })
		}

		if (request.method === 'GET' && action === 'lookup-room') {
			if (!roomCode) {
				return Response.json({ error: 'Missing code' }, { status: 400 })
			}
			const room = rooms.get(roomCode)
			if (!room) {
				return Response.json({ error: 'Room not found' }, { status: 404 })
			}
			return Response.json({
				hostSessionId: room.hostSessionId,
				name: room.name,
				peers: room.peers,
			})
		}

		if (request.method === 'POST' && action === 'remove-peer') {
			if (!roomCode || !body?.sessionId) {
				return Response.json(
					{ error: 'Missing code or sessionId' },
					{ status: 400 },
				)
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
			return Response.json({ ok: true })
		}

		return Response.json({ error: 'Unknown action' }, { status: 400 })
	}

	// Transparent proxy for the SFU API. The app token never leaves the
	// server; clients talk to /api/sync/sfu/... only.
	const sfuPath = url.pathname.replace(/^\/api\/sync\/sfu/, '')
	if (sfuPath.startsWith('/sessions')) {
		const response = await fetch(`${API_BASE}/${env.APP_ID}${sfuPath}`, {
			method: request.method,
			headers: {
				Authorization: `Bearer ${env.APP_TOKEN}`,
				'Content-Type': 'application/json',
			},
			body: request.body,
		})
		return new Response(response.body, {
			status: response.status,
			headers: { 'Content-Type': 'application/json' },
		})
	}

	return new Response('Not found', { status: 404 })
}
