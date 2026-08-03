/**
 * Pure group-document helpers for multi-device sync.
 *
 * Kept free of WebRTC / IndexedDB / Valtio so claim fencing and group-state
 * apply decisions can be unit-tested without a browser.
 */

/** Cross-device media identity (group-scoped — only one at a time). */
export interface GroupMedia {
	hash: string
	name: string
}

/** Fenced player/coordinator claim. */
export interface GroupClaim {
	term: number
	claimantId: string
}

/** Playback clock carried in group snapshots. */
export interface GroupClock {
	isPlaying: boolean
	positionMs: number
	playSpeed: number
}

/**
 * Authoritative shared group document. Single writer = claim claimant
 * (or the default lowest-id coordinator before anyone claims).
 */
export interface GroupState {
	media: GroupMedia | null
	claim: GroupClaim | null
	clock: GroupClock
}

export const emptyGroupClock = (): GroupClock => ({
	isPlaying: false,
	positionMs: 0,
	playSpeed: 1,
})

export const emptyGroupState = (): GroupState => ({
	media: null,
	claim: null,
	clock: emptyGroupClock(),
})

export const isValidClaim = (
	claim: GroupClaim | null | undefined,
): claim is GroupClaim =>
	!!claim &&
	Number.isSafeInteger(claim.term) &&
	claim.term >= 1 &&
	claim.term <= 1_000_000_000 &&
	typeof claim.claimantId === 'string' &&
	claim.claimantId.length > 0 &&
	claim.claimantId.length <= 128

/** True when `next` beats `current` under term/id fencing. */
export const claimIsSuperior = (
	next: GroupClaim | null,
	current: GroupClaim | null,
): boolean => {
	if (!next) return false
	if (!current) return true
	return (
		next.term > current.term ||
		(next.term === current.term && next.claimantId > current.claimantId)
	)
}

export const claimsAreEqual = (
	a: GroupClaim | null | undefined,
	b: GroupClaim | null | undefined,
): boolean => !!a && !!b && a.term === b.term && a.claimantId === b.claimantId

export const isValidGroupMedia = (
	media: GroupMedia | null | undefined,
): media is GroupMedia | null => {
	if (media === null || media === undefined) return media === null
	return (
		typeof media.hash === 'string' &&
		media.hash.length > 0 &&
		media.hash.length <= 128 &&
		typeof media.name === 'string' &&
		media.name.length <= 256
	)
}

export const isValidGroupClock = (
	c: GroupClock | null | undefined,
): c is GroupClock =>
	!!c &&
	typeof c.isPlaying === 'boolean' &&
	Number.isFinite(c.positionMs) &&
	c.positionMs >= 0 &&
	Number.isFinite(c.playSpeed) &&
	c.playSpeed >= 0.1 &&
	c.playSpeed <= 5

/**
 * Planned reaction to an inbound `group-state` snapshot, before any I/O.
 *
 * - ignore: drop silently
 * - reassert: we hold a better claim; rebroadcast ours
 * - take-pending: claimless room + we opened a file before join
 * - apply: adopt claim/media/clock from the snapshot
 */
export type GroupStatePlan =
	| { type: 'ignore' }
	| { type: 'reassert' }
	| { type: 'take-pending' }
	| {
			type: 'apply'
			nextClaim: GroupClaim | null
			clearPending: boolean
	  }

export function planGroupStateApply(input: {
	incoming: GroupState
	currentClaim: GroupClaim | null
	peerId: string
	sessionId: string | null
	hasPendingPlayerFile: boolean
}): GroupStatePlan {
	const { incoming, currentClaim, peerId, sessionId, hasPendingPlayerFile } =
		input

	if (
		!incoming ||
		typeof incoming !== 'object' ||
		!isValidGroupMedia(incoming.media) ||
		!isValidGroupClock(incoming.clock) ||
		(incoming.claim !== null && !isValidClaim(incoming.claim))
	) {
		return { type: 'ignore' }
	}

	if (incoming.claim) {
		if (incoming.claim.claimantId !== peerId) return { type: 'ignore' }
		const sameClaim = claimsAreEqual(currentClaim, incoming.claim)
		// Equal claim = normal refresh from the current player (clock ticks,
		// media casts). Only strictly inferior claims are rejected.
		if (
			currentClaim &&
			!sameClaim &&
			!claimIsSuperior(incoming.claim, currentClaim)
		) {
			return currentClaim.claimantId === sessionId
				? { type: 'reassert' }
				: { type: 'ignore' }
		}
		return {
			type: 'apply',
			nextClaim: {
				term: incoming.claim.term,
				claimantId: incoming.claim.claimantId,
			},
			clearPending: true,
		}
	}

	if (currentClaim) {
		// Claimed group ignores claimless snapshots.
		return currentClaim.claimantId === sessionId
			? { type: 'reassert' }
			: { type: 'ignore' }
	}

	// Claimless snapshot while we still have a pending file from opening
	// before join: take the stage with OUR file. Do not adopt orphan
	// media/clock from a departed player first.
	if (hasPendingPlayerFile) {
		return { type: 'take-pending' }
	}

	return {
		type: 'apply',
		nextClaim: null,
		clearPending: false,
	}
}
