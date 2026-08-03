/**
 * In-memory multi-engine sync harness for Vitest.
 * Distinct SyncEngine instances + microtask message bus (no WebRTC / IDB).
 */
import { FileTransfer } from './file-transfer'
import {
	createEmptySyncState,
	createSyncEngine,
	type SyncEngine,
	type SyncFileRow,
	type SyncMessage,
	type SyncState,
	type SyncTransport,
} from './sync'

type FakeDc =
	SyncTransport['inboundDcs'] extends Map<string, infer V> ? V : never

export type CapturedWire = {
	from: string
	to: string
	msg: SyncMessage
}

export class MemoryBus {
	private readonly engines = new Map<string, SyncEngine>()
	private queue: Array<() => void> = []
	readonly wire: CapturedWire[] = []

	register(sessionId: string, engine: SyncEngine) {
		this.engines.set(sessionId, engine)
	}

	unregister(sessionId: string) {
		this.engines.delete(sessionId)
	}

	/** Enqueue delivery matching a data-channel turn (not nested sync). */
	enqueue(from: string, to: string, raw: string) {
		this.queue.push(() => {
			let msg: SyncMessage
			try {
				msg = JSON.parse(raw) as SyncMessage
			} catch {
				return
			}
			this.wire.push({ from, to, msg })
			this.engines.get(to)?.handleMessage(msg, from)
		})
	}

	/**
	 * Drain queued deliveries and allow announceFile / resolveNowPlayingFile
	 * promises to settle.
	 */
	async flush(maxTurns = 40) {
		for (let turn = 0; turn < maxTurns; turn++) {
			let didWork = false
			while (this.queue.length > 0) {
				didWork = true
				const batch = this.queue.splice(0)
				for (const job of batch) job()
			}
			await Promise.resolve()
			await Promise.resolve()
			await new Promise<void>((resolve) => setTimeout(resolve, 0))
			if (!didWork && this.queue.length === 0) return
		}
		throw new Error('MemoryBus.flush: queue did not drain')
	}
}

export class FakeTransport implements SyncTransport {
	inboundDcs = new Map<string, FakeDc>()

	constructor(
		private bus: MemoryBus,
		private host: SyncEngine,
		private state: SyncState,
	) {}

	connectPresence(): Promise<void> {
		return Promise.resolve()
	}

	teardown() {
		this.inboundDcs.clear()
	}

	/**
	 * Mirror webrtc-transport attachDataChannel onopen: mark connected,
	 * claimant broadcast, join, coordinator handlePeerJoin.
	 */
	openPeer(peerSessionId: string) {
		const fromId = this.state.sessionId
		if (!fromId) throw new Error('FakeTransport.openPeer: sessionId not set')

		const dc: FakeDc = {
			readyState: 'open',
			bufferedAmount: 0,
			bufferedAmountLowThreshold: 0,
			send: (data: string) => {
				this.bus.enqueue(fromId, peerSessionId, data)
			},
			addEventListener: () => {},
			removeEventListener: () => {},
		}
		this.inboundDcs.set(peerSessionId, dc)

		this.state.roomPeers = this.state.roomPeers.map((peer) =>
			peer.sessionId === peerSessionId ? { ...peer, connected: true } : peer,
		)

		if (this.state.group.claim?.claimantId === this.state.sessionId) {
			this.host.broadcastGroupState()
		}
		this.host.send({ type: 'join', deviceName: this.state.deviceName })
		if (this.host.isCoordinator) void this.host.handlePeerJoin()
	}
}

export type TestPair = {
	bus: MemoryBus
	a: SyncEngine
	b: SyncEngine
	files: SyncFileRow[]
	transportA: FakeTransport
	transportB: FakeTransport
}

/** device-a < device-b ⇒ A is default coordinator before any claim. */
export function createTestPair(files?: SyncFileRow[]): TestPair {
	const library = files ?? [
		{ id: 'file-1', hash: 'hash-1', name: 'One.srt' },
		{ id: 'file-2', hash: 'hash-2', name: 'Two.srt' },
	]
	const getFiles = async () => library
	const bus = new MemoryBus()

	let transportA!: FakeTransport
	let transportB!: FakeTransport

	const a = createSyncEngine({
		state: createEmptySyncState({ deviceName: 'Device A' }),
		getFiles,
		transportFactory: (host, state) => {
			transportA = new FakeTransport(bus, host, state)
			return transportA
		},
		fileTransferFactory: (engine, state) => stubFileTransfer(engine, state),
	})
	const b = createSyncEngine({
		state: createEmptySyncState({ deviceName: 'Device B' }),
		getFiles,
		transportFactory: (host, state) => {
			transportB = new FakeTransport(bus, host, state)
			return transportB
		},
		fileTransferFactory: (engine, state) => stubFileTransfer(engine, state),
	})

	return { bus, a, b, files: library, transportA, transportB }
}

function stubFileTransfer(engine: SyncEngine, state: SyncState): FileTransfer {
	const ft = new FileTransfer(engine, state)
	ft.sendFile = async () => {}
	ft.handleDeviceLibrary = async () => {}
	return ft
}

export function enterRoom(
	engine: SyncEngine,
	opts: { sessionId: string; deviceName: string; roomCode?: string },
) {
	engine.state.role = 'peer'
	engine.state.connectionState = 'connected'
	engine.state.sessionId = opts.sessionId
	engine.state.deviceName = opts.deviceName
	engine.state.roomCode = opts.roomCode ?? 'TESTROOMCODETESTROOM'
	engine.state.roomPeers = []
}

/** Register on the bus and open bidirectional fake data channels. */
export async function linkPeers(pair: TestPair) {
	const { a, b, bus, transportA, transportB } = pair
	const idA = a.state.sessionId
	const idB = b.state.sessionId
	if (!idA || !idB) throw new Error('linkPeers: enterRoom both engines first')

	bus.register(idA, a)
	bus.register(idB, b)

	a.state.roomPeers = [
		{ sessionId: idB, name: b.state.deviceName, connected: false },
	]
	b.state.roomPeers = [
		{ sessionId: idA, name: a.state.deviceName, connected: false },
	]

	transportA.openPeer(idB)
	transportB.openPeer(idA)
	await bus.flush()
}
