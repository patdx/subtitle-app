import { describe, expect, it, vi } from 'vitest'
import { applyTimelineChange } from './timeline-interaction'

describe('applyTimelineChange', () => {
	it('previews pointer scrubbing without flooding commits', () => {
		const preview = vi.fn()
		const commit = vi.fn()

		applyTimelineChange(12_300, true, { preview, commit })

		expect(preview).toHaveBeenCalledWith(12_300)
		expect(commit).not.toHaveBeenCalled()
	})

	it('commits native keyboard range changes immediately', () => {
		const preview = vi.fn()
		const commit = vi.fn()

		applyTimelineChange(12_300, false, { preview, commit })

		expect(preview).toHaveBeenCalledWith(12_300)
		expect(commit).toHaveBeenCalledWith(12_300)
	})
})
