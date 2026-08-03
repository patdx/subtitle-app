import { queryOptions } from '@tanstack/react-query'
import { sortBy } from 'lodash-es'
import { initAndGetDb, type DbLine } from './utils'

export type FileRecord = {
	id: string
	name: string
	hash?: string
	length?: number
	progress?: number
	lastPlayed?: number
}

export type LoadedPlayerFile = {
	fileId: string
	file: FileRecord | undefined
	lines: DbLine[]
}

export const filesQueryKey = ['files'] as const

export const filesQueryOptions = queryOptions({
	queryKey: filesQueryKey,
	queryFn: async () => {
		const db = await initAndGetDb()
		return (await db.getAll('files')) as FileRecord[]
	},
})

export const fileQueryOptions = (fileId: string) =>
	queryOptions({
		queryKey: ['file', fileId] as const,
		queryFn: async (): Promise<LoadedPlayerFile> => {
			const db = await initAndGetDb()
			let lines = await db.getAllFromIndex('lines', 'by-file-id', fileId)
			lines = sortBy(lines, (line) => line.from)
			const file = await db.get('files', fileId)
			return { fileId, file, lines }
		},
	})
