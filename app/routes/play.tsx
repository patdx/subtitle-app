import { Page } from '~/components'
import { sortBy } from 'lodash-es'
import { observer } from 'mobx-react-lite'
import { TranscriptDisplay } from '~/shared/transcript-display'

// TODO: update the whole page bg to black when this page is open

export default function PlayPage() {
	return (
		<Page>
			<Play />
		</Page>
	)
}

const Play = observer(() => {
	async function loadFile() {
		const fileId = new URL(location.href).searchParams.get('id')
		if (!fileId) {
			console.warn(`No id provided, waiting for file id...`)
			return
		}
		const db = await initAndGetDb()
		let lines = await db.getAllFromIndex('lines', 'by-file-id', fileId)
		console.log(`loaded ${lines.length} lines`)
		lines = sortBy(lines, (line) => line.from)
		setFile(lines)
	}

	useEffect(() => {
		loadFile()
	}, [])

	return (
		<>
			<div className="relative h-full overflow-hidden bg-black">
				<FileDisplay />
				<TranscriptDisplay />
				<Controls />
			</div>
		</>
	)
})
