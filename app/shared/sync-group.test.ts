import { describe, expect, it } from 'vitest'
import {
	claimIsSuperior,
	claimsAreEqual,
	emptyGroupClock,
	planGroupStateApply,
	type GroupClaim,
	type GroupState,
} from './sync-group'

const clock = (
	overrides: Partial<ReturnType<typeof emptyGroupClock>> = {},
) => ({
	...emptyGroupClock(),
	...overrides,
})

const snapshot = (
	overrides: Partial<GroupState> & Pick<GroupState, 'claim' | 'media'>,
): GroupState => ({
	clock: clock(),
	...overrides,
})

describe('claimIsSuperior', () => {
	it('accepts any claim when none is held', () => {
		expect(claimIsSuperior({ term: 1, claimantId: 'a' }, null)).toBe(true)
	})

	it('prefers higher terms', () => {
		const current: GroupClaim = { term: 1, claimantId: 'z' }
		expect(claimIsSuperior({ term: 2, claimantId: 'a' }, current)).toBe(true)
		expect(claimIsSuperior({ term: 1, claimantId: 'a' }, current)).toBe(false)
	})

	it('breaks equal-term ties by claimantId', () => {
		const current: GroupClaim = { term: 1, claimantId: 'aaa' }
		expect(claimIsSuperior({ term: 1, claimantId: 'bbb' }, current)).toBe(true)
		expect(claimIsSuperior({ term: 1, claimantId: 'aaa' }, current)).toBe(false)
		expect(claimIsSuperior({ term: 1, claimantId: '000' }, current)).toBe(false)
	})
})

describe('claimsAreEqual', () => {
	it('requires matching term and claimantId', () => {
		const a: GroupClaim = { term: 1, claimantId: 'player' }
		expect(claimsAreEqual(a, { term: 1, claimantId: 'player' })).toBe(true)
		expect(claimsAreEqual(a, { term: 2, claimantId: 'player' })).toBe(false)
		expect(claimsAreEqual(a, { term: 1, claimantId: 'other' })).toBe(false)
		expect(claimsAreEqual(a, null)).toBe(false)
	})
})

describe('planGroupStateApply', () => {
	const player = 'player-a'
	const follower = 'follower-b'

	it('applies equal-claim snapshots so clock/media keep refreshing', () => {
		const claim: GroupClaim = { term: 1, claimantId: player }
		const plan = planGroupStateApply({
			incoming: snapshot({
				claim,
				media: { hash: 'h2', name: 'B.srt' },
				clock: clock({ isPlaying: true, positionMs: 12_000 }),
			}),
			currentClaim: claim,
			peerId: player,
			sessionId: follower,
			hasPendingPlayerFile: false,
		})
		expect(plan).toEqual({
			type: 'apply',
			nextClaim: claim,
			clearPending: true,
		})
	})

	it('rejects forged claims whose claimantId is not the sender', () => {
		const plan = planGroupStateApply({
			incoming: snapshot({
				claim: { term: 2, claimantId: player },
				media: { hash: 'h1', name: 'A.srt' },
			}),
			currentClaim: null,
			peerId: 'imposter',
			sessionId: follower,
			hasPendingPlayerFile: false,
		})
		expect(plan).toEqual({ type: 'ignore' })
	})

	it('lets the claim holder reassert against an inferior claim', () => {
		const plan = planGroupStateApply({
			incoming: snapshot({
				claim: { term: 1, claimantId: 'aaa' },
				media: null,
			}),
			currentClaim: { term: 1, claimantId: 'zzz' },
			peerId: 'aaa',
			sessionId: 'zzz',
			hasPendingPlayerFile: false,
		})
		expect(plan).toEqual({ type: 'reassert' })
	})

	it('accepts a superior claim from another peer', () => {
		const plan = planGroupStateApply({
			incoming: snapshot({
				claim: { term: 2, claimantId: player },
				media: { hash: 'h1', name: 'A.srt' },
			}),
			currentClaim: { term: 1, claimantId: follower },
			peerId: player,
			sessionId: follower,
			hasPendingPlayerFile: true,
		})
		expect(plan).toEqual({
			type: 'apply',
			nextClaim: { term: 2, claimantId: player },
			clearPending: true,
		})
	})

	it('takes pending instead of adopting orphan media when claimless', () => {
		const plan = planGroupStateApply({
			incoming: snapshot({
				claim: null,
				media: { hash: 'orphan', name: 'Old.srt' },
				clock: clock({ positionMs: 99_000, isPlaying: true }),
			}),
			currentClaim: null,
			peerId: player,
			sessionId: follower,
			hasPendingPlayerFile: true,
		})
		expect(plan).toEqual({ type: 'take-pending' })
	})

	it('applies claimless snapshots when there is no pending file', () => {
		const plan = planGroupStateApply({
			incoming: snapshot({
				claim: null,
				media: { hash: 'orphan', name: 'Old.srt' },
			}),
			currentClaim: null,
			peerId: player,
			sessionId: follower,
			hasPendingPlayerFile: false,
		})
		expect(plan).toEqual({
			type: 'apply',
			nextClaim: null,
			clearPending: false,
		})
	})

	it('ignores claimless snapshots while a claim is held (followers)', () => {
		const plan = planGroupStateApply({
			incoming: snapshot({ claim: null, media: null }),
			currentClaim: { term: 1, claimantId: player },
			peerId: follower,
			sessionId: follower,
			hasPendingPlayerFile: false,
		})
		expect(plan).toEqual({ type: 'ignore' })
	})

	it('reasserts claimless snapshots when we hold the claim', () => {
		const plan = planGroupStateApply({
			incoming: snapshot({ claim: null, media: null }),
			currentClaim: { term: 1, claimantId: player },
			peerId: follower,
			sessionId: player,
			hasPendingPlayerFile: false,
		})
		expect(plan).toEqual({ type: 'reassert' })
	})

	it('ignores invalid clock payloads', () => {
		const plan = planGroupStateApply({
			incoming: {
				claim: { term: 1, claimantId: player },
				media: null,
				clock: {
					isPlaying: true,
					positionMs: -1,
					playSpeed: 1,
				},
			},
			currentClaim: null,
			peerId: player,
			sessionId: follower,
			hasPendingPlayerFile: false,
		})
		expect(plan).toEqual({ type: 'ignore' })
	})
})
