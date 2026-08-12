import { describe, expect, it } from 'vitest'
import { resolvePlayerContentState } from './player-content-state'

describe('resolvePlayerContentState', () => {
	it('matches the prerendered player before hydration even with a file ID', () => {
		expect(
			resolvePlayerContentState({
				hydrated: false,
				hasFileId: true,
				isPending: true,
				isFetched: false,
				hasFile: false,
			}),
		).toBe('player')
	})

	it('reveals query-dependent states after hydration', () => {
		expect(
			resolvePlayerContentState({
				hydrated: true,
				hasFileId: true,
				isPending: true,
				isFetched: false,
				hasFile: false,
			}),
		).toBe('loading')

		expect(
			resolvePlayerContentState({
				hydrated: true,
				hasFileId: true,
				isPending: false,
				isFetched: true,
				hasFile: false,
			}),
		).toBe('missing')
	})
})
