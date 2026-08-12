import { describe, expect, it } from 'vitest'
import { calculatePlaybackPosition } from './utils'

describe('calculatePlaybackPosition', () => {
	it('advances according to playback speed', () => {
		expect(calculatePlaybackPosition(2_000, 3_000, 1.5, 10_000)).toEqual({
			positionMs: 6_500,
			hasEnded: false,
		})
	})

	it('stops exactly at the media duration', () => {
		expect(calculatePlaybackPosition(8_000, 3_000, 1, 10_000)).toEqual({
			positionMs: 10_000,
			hasEnded: true,
		})
	})

	it('does not mark an unknown-duration clock as ended', () => {
		expect(calculatePlaybackPosition(8_000, 3_000, 1, 0)).toEqual({
			positionMs: 11_000,
			hasEnded: false,
		})
	})

	it('never returns a negative position', () => {
		expect(calculatePlaybackPosition(-2_000, 0, 1, 10_000)).toEqual({
			positionMs: 0,
			hasEnded: false,
		})
	})
})
