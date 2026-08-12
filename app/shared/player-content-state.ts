type PlayerContentStateInput = {
	hydrated: boolean
	hasFileId: boolean
	isPending: boolean
	isFetched: boolean
	hasFile: boolean
}

export function resolvePlayerContentState({
	hydrated,
	hasFileId,
	isPending,
	isFetched,
	hasFile,
}: PlayerContentStateInput): 'player' | 'loading' | 'missing' {
	// `/play` is prerendered without a query string. Keep the first client render
	// identical to that HTML, then reveal query-dependent states after hydration.
	if (!hydrated || !hasFileId) return 'player'
	if (isPending) return 'loading'
	if (isFetched && !hasFile) return 'missing'
	return 'player'
}
