import { nanoid } from 'nanoid'
import { addFileToDatabase, initAndGetDb, linesToSrtText } from './utils'
import type { SyncMessage, SyncState } from './sync'

const CHUNK_SIZE = 32 * 1024
const MAX_CONCURRENT_TRANSFERS = 4
const MAX_TRANSFER_CHUNKS = 1024

/** The subset of SyncEngine the file-transfer protocol talks to. */
interface TransferEngine {
	send(msg: SyncMessage): void
	sendWithBackpressure(msg: SyncMessage): Promise<void>
	readonly isCoordinator: boolean
	announceFile(): Promise<void>
}

interface ReceiveBuffer {
	hash: string
	name: string
	total: number
	chunks: (string | null)[]
	timeout: number
}

/**
 * The file-sharing protocol over the sync data channel: serializing local
 * files to SRT text, chunking them with backpressure, reassembling chunks on
 * the receiving side, and importing the result. Keyed by content hash.
 */
export class FileTransfer {
	receiveBuffers = new Map<string, ReceiveBuffer>()
	lastFileRequestAt = new Map<string, number>()

	constructor(
		private engine: TransferEngine,
		private state: SyncState,
	) {}

	async sendFile(hash: string) {
		const db = await initAndGetDb()
		const file = (await db.getAll('files')).find((f) => f.hash === hash)
		if (!file) return
		const lines = await db.getAllFromIndex('lines', 'by-file-id', file.id)
		lines.sort((a, b) => a.from - b.from)
		if (lines.length === 0) return

		const text = linesToSrtText(lines)
		const transferId = nanoid()
		const totalChunks = Math.max(1, Math.ceil(text.length / CHUNK_SIZE))
		if (totalChunks > MAX_TRANSFER_CHUNKS) {
			this.state.error = 'This subtitle file is too large to sync directly'
			return
		}

		for (let i = 0; i < totalChunks; i++) {
			await this.engine.sendWithBackpressure({
				type: 'file-chunk',
				transferId,
				chunkIndex: i,
				totalChunks,
				hash,
				name: file.name,
				data: text.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
			})
		}
	}

	async handleFileList(msg: Extract<SyncMessage, { type: 'file-list' }>) {
		const db = await initAndGetDb()
		const localHashes = new Set(
			(await db.getAll('files'))
				.map((file) => file.hash)
				.filter((hash): hash is string => Boolean(hash)),
		)
		for (const file of msg.files) {
			if (!localHashes.has(file.hash)) {
				this.engine.send({ type: 'request-file', hash: file.hash })
			}
		}
	}

	handleFileChunk(msg: Extract<SyncMessage, { type: 'file-chunk' }>) {
		if (
			typeof msg.transferId !== 'string' ||
			msg.transferId.length > 128 ||
			typeof msg.hash !== 'string' ||
			msg.hash.length > 128 ||
			typeof msg.name !== 'string' ||
			msg.name.length > 256 ||
			!Number.isInteger(msg.totalChunks) ||
			msg.totalChunks < 1 ||
			msg.totalChunks > MAX_TRANSFER_CHUNKS ||
			!Number.isInteger(msg.chunkIndex) ||
			msg.chunkIndex < 0 ||
			msg.chunkIndex >= msg.totalChunks ||
			typeof msg.data !== 'string' ||
			msg.data.length > CHUNK_SIZE
		)
			return
		let buffer = this.receiveBuffers.get(msg.transferId)
		if (!buffer) {
			if (this.receiveBuffers.size >= MAX_CONCURRENT_TRANSFERS) return
			buffer = {
				hash: msg.hash,
				name: msg.name,
				total: msg.totalChunks,
				chunks: new Array<string | null>(msg.totalChunks).fill(null),
				timeout: window.setTimeout(() => {
					this.receiveBuffers.delete(msg.transferId)
					this.updateTransfers()
				}, 60_000),
			}
			this.receiveBuffers.set(msg.transferId, buffer)
		}
		if (buffer.total !== msg.totalChunks || buffer.hash !== msg.hash) return
		buffer.chunks[msg.chunkIndex] = msg.data
		this.updateTransfers()

		if (buffer.chunks.every((chunk) => chunk !== null)) {
			window.clearTimeout(buffer.timeout)
			this.receiveBuffers.delete(msg.transferId)
			this.updateTransfers()
			const text = (buffer.chunks as string[]).join('')
			void this.importReceivedFile(buffer.hash, buffer.name, text)
		}
	}

	private updateTransfers() {
		this.state.transfers = [...this.receiveBuffers.values()].map((buffer) => ({
			fileName: buffer.name,
			received: buffer.chunks.filter((chunk) => chunk !== null).length,
			total: buffer.total,
		}))
	}

	private async importReceivedFile(hash: string, name: string, text: string) {
		if (this.state.receivedFiles.some((file) => file.hash === hash)) return
		try {
			const fileId = await addFileToDatabase(text, name)
			this.state.receivedFiles = [
				...this.state.receivedFiles,
				{ fileId, hash, name },
			]
			if (this.state.nowPlayingFile?.hash === hash) {
				this.state.nowPlayingFile = { ...this.state.nowPlayingFile, fileId }
				// I'm the renderer and just received the picked file: tell the
				// group so everyone maps it to their local copy.
				if (this.engine.isCoordinator) void this.engine.announceFile()
			}
		} catch (err) {
			console.error('Failed to import received file', err)
		}
	}
}
