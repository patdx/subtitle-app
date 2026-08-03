import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('nosleep.js', () => ({
	default: class NoSleep {
		enable() {}
		disable() {}
	},
}))

import { setClock, toggleIsPlaying } from './utils'
import {
	createTestPair,
	enterRoom,
	linkPeers,
	type TestPair,
} from './sync-harness'
import type { GroupState, SyncMessage } from './sync'

function groupStatesFrom(
	pair: TestPair,
	from: string,
): Extract<SyncMessage, { type: 'group-state' }>[] {
	return pair.bus.wire
		.filter((w) => w.from === from && w.msg.type === 'group-state')
		.map((w) => w.msg as Extract<SyncMessage, { type: 'group-state' }>)
}

function validClock(overrides: Partial<GroupState['clock']> = {}) {
	return {
		isPlaying: false,
		positionMs: 0,
		playSpeed: 1,
		...overrides,
	}
}

describe('SyncEngine memory bus harness', () => {
	let pair: TestPair

	beforeEach(() => {
		// Module clock singleton — reset so prior tests don't leave isPlaying.
		toggleIsPlaying(false)
		setClock({
			lastActionAt: Date.now(),
			lastTimeElapsedMs: 0,
			playSpeed: 1,
		})
		pair = createTestPair()
		enterRoom(pair.a, { sessionId: 'device-a', deviceName: 'Device A' })
		enterRoom(pair.b, { sessionId: 'device-b', deviceName: 'Device B' })
	})

	it('propagates claim + media from A to B', async () => {
		await linkPeers(pair)
		pair.bus.wire.length = 0

		await pair.a.becomeActivePlayer({
			fileId: 'file-1',
			hash: 'hash-1',
			name: 'One.srt',
		})
		await pair.bus.flush()

		expect(pair.a.state.group.claim).toEqual({
			term: 1,
			claimantId: 'device-a',
		})
		expect(pair.a.state.group.media).toEqual({
			hash: 'hash-1',
			name: 'One.srt',
		})
		expect(pair.b.state.group.claim).toEqual(pair.a.state.group.claim)
		expect(pair.b.state.group.media).toEqual(pair.a.state.group.media)
		expect(groupStatesFrom(pair, 'device-a').length).toBeGreaterThan(0)
	})

	it('casts playFile from remote B onto claimant A', async () => {
		await linkPeers(pair)
		await pair.a.becomeActivePlayer({
			fileId: 'file-1',
			hash: 'hash-1',
			name: 'One.srt',
		})
		await pair.bus.flush()
		pair.bus.wire.length = 0

		pair.b.playFile('hash-2', 'Two.srt')
		await pair.bus.flush()

		expect(pair.a.state.group.media).toEqual({
			hash: 'hash-2',
			name: 'Two.srt',
		})
		expect(pair.b.state.group.media).toEqual({
			hash: 'hash-2',
			name: 'Two.srt',
		})
		// Seeded getFiles must resolve the cast title on the claimant.
		expect(pair.a.state.nowPlayingFile).toEqual({
			fileId: 'file-2',
			hash: 'hash-2',
			name: 'Two.srt',
		})
		expect(pair.a.state.group.claim?.claimantId).toBe('device-a')
		expect(
			pair.bus.wire.some(
				(w) =>
					w.from === 'device-b' &&
					w.msg.type === 'group-propose' &&
					w.msg.op.type === 'set-media',
			),
		).toBe(true)
		expect(groupStatesFrom(pair, 'device-a').length).toBeGreaterThan(0)
	})

	it('reasserts when an inferior claim is injected', async () => {
		await linkPeers(pair)
		await pair.a.becomeActivePlayer({
			fileId: 'file-1',
			hash: 'hash-1',
			name: 'One.srt',
		})
		await pair.bus.flush()
		// Ensure A outranks any term-1 claim from B.
		pair.a.state.group.claim = { term: 2, claimantId: 'device-a' }
		pair.bus.wire.length = 0

		pair.a.handleMessage(
			{
				type: 'group-state',
				state: {
					claim: { term: 1, claimantId: 'device-b' },
					media: { hash: 'hash-evil', name: 'Evil.srt' },
					clock: validClock({ positionMs: 999 }),
				},
			},
			'device-b',
		)
		await pair.bus.flush()

		expect(pair.a.state.group.claim).toEqual({
			term: 2,
			claimantId: 'device-a',
		})
		expect(pair.a.state.group.media).toEqual({
			hash: 'hash-1',
			name: 'One.srt',
		})
		// Reassert fans out; B converges back to A's document.
		expect(pair.b.state.group.claim).toEqual(pair.a.state.group.claim)
		expect(pair.b.state.group.media).toEqual(pair.a.state.group.media)
		expect(groupStatesFrom(pair, 'device-a').length).toBeGreaterThan(0)
	})

	it('catch-up: late joiner receives group snapshot without claiming', async () => {
		// A is alone first, claims, then B links (open-peer handshake).
		enterRoom(pair.a, { sessionId: 'device-a', deviceName: 'Device A' })
		await pair.a.becomeActivePlayer({
			fileId: 'file-1',
			hash: 'hash-1',
			name: 'One.srt',
		})
		expect(pair.a.state.group.claim?.claimantId).toBe('device-a')

		enterRoom(pair.b, { sessionId: 'device-b', deviceName: 'Device B' })
		await linkPeers(pair)

		expect(pair.a.state.group.claim).toEqual({
			term: 1,
			claimantId: 'device-a',
		})
		expect(pair.b.state.group.claim).toEqual({
			term: 1,
			claimantId: 'device-a',
		})
		expect(pair.b.state.group.media).toEqual({
			hash: 'hash-1',
			name: 'One.srt',
		})
		expect(pair.b.state.group.claim?.claimantId).not.toBe('device-b')
		expect(groupStatesFrom(pair, 'device-a').length).toBeGreaterThan(0)
	})
})
