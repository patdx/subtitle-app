type TimelineChangeActions = {
	preview: (positionMs: number) => void
	commit: (positionMs: number) => void
}

/**
 * Preview pointer drags locally, but commit non-pointer changes immediately.
 * Native range keyboard interaction has no pointer-up event to commit it later.
 */
export function applyTimelineChange(
	positionMs: number,
	isPointerScrubbing: boolean,
	actions: TimelineChangeActions,
) {
	actions.preview(positionMs)
	if (!isPointerScrubbing) actions.commit(positionMs)
}
