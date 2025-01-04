import { Page } from 'konsta/react'
import { DateTime } from 'luxon'

export default function PlayPage() {
	return (
		<Page>
			<Play />
		</Page>
	)
}

const Play = () => {
	const updateElapsedTime = () => {
		const timeSinceLastAction = clock.isPlaying
			? Math.abs(DateTime.fromJSDate(clock.lastActionAt).diffNow().toMillis()) *
				clock.playSpeed
			: 0
		setTimeElapsed(timeSinceLastAction + clock.lastTimeElapsedMs)
		requestAnimationFrame(updateElapsedTime)
	}

	async function loadFile() {
		const fileId = new URL(location.href).searchParams.get('id')
		if (!fileId) {
			console.warn(`No id provided, waiting for file id...`)
			return
		}
		const db = await initAndGetDb()
		const lines = await db.getAllFromIndex('lines', 'by-file-id', fileId)
		console.log(`loaded ${lines.length} lines`)
		setFile(lines)
	}

	useEffect(() => {
		loadFile()
	}, [])

	useEffect(() => {
		requestAnimationFrame(updateElapsedTime)
	}, [])

	return (
		<>
			<div className="relative h-full overflow-hidden bg-black">
				<div className="absolute left-0 right-0 top-[-100%] bottom-[-100%]">
					<FileDisplay />
				</div>

				<Controls />
			</div>
		</>
	)
}
