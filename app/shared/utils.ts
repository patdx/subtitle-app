import * as mobx from 'mobx'
import { openDB, type DBSchema } from 'idb'
import { findLast, once } from 'lodash-es'
import { parse } from '@plussub/srt-vtt-parser'
import { nanoid } from 'nanoid'
import { Duration } from 'luxon'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

export interface Entry {
	id: string
	from: number
	to: number
	text: string
}

export const nodeIsActive = (node: Entry, currentTime: number): boolean => {
	return currentTime > node.from && currentTime < node.to
}

export const getActiveNodes = (
	nodes: Entry[] = [],
	currentTime: number,
): Entry[] => {
	const selectedNodes = new Set<Entry>()

	const first = nodes?.[0]
	if (first && currentTime < first.from) {
		selectedNodes.add(first)
	}

	nodes.forEach((node, index) => {
		const isActive = nodeIsActive(node, currentTime)
		if (!isActive) return

		// TODO: find a way to show next uppcoming node
		// even if no active node is currently set
		// const previous = nodes[index - 1];
		// if (previous) {
		//   selectedNodes.add(previous);
		// }
		selectedNodes.add(node)
		// const next = nodes[index + 1];
		// if (next) {
		//   selectedNodes.add(next);
		// }
	})

	if (selectedNodes.size === 0) {
		const last = findLast(nodes, (node) => {
			node.to < currentTime
		})

		if (last) {
			selectedNodes.add(last as any)
		}
		// no active nodes, find the next closest node
		const next = nodes.find((node) => {
			node.from > currentTime
		})

		if (next) {
			selectedNodes.add(next)
		}
	}

	const last = nodes[nodes.length - 1]
	if (last && currentTime > last.to) {
		selectedNodes.add(last)
	}

	return [...selectedNodes]
}

class ControlState {
	constructor() {
		mobx.makeAutoObservable(
			this,
			{},
			{
				autoBind: true,
			},
		)
	}

	isOpen = true
	toggle() {
		this.isOpen = !this.isOpen
	}

	fullScreenEnabled = globalThis.document?.fullscreenEnabled ?? false
	get showFullScreenButton() {
		return this.isOpen && this.fullScreenEnabled
	}

	showTranscript = false
	toggleTranscript() {
		this.showTranscript = !this.showTranscript
	}
}
export const controlState = new ControlState()

const getNoSleep = once(async () => {
	const { default: NoSleep } = await import('nosleep.js')
	return new NoSleep()
})

function enableNoSleep() {
	getNoSleep().then((ns) => ns.enable())
}

function disableNoSleep() {
	getNoSleep().then((ns) => ns.disable())
}

export class ClockStore {
	constructor() {
		mobx.makeAutoObservable(
			this,
			{},
			{
				autoBind: true,
			},
		)
	}

	lastActionAt = Date.now()
	lastTimeElapsedMs = 0
	playSpeed = 1
	isPlaying = false

	/** is calculated based on lastActionAt, playSpeed and lastTimeElapsedMs */
	actualTimeElapsedMs = 0

	calculateActualTimeElapsedMs() {
		const timeSinceLastAction = this.isPlaying
			? Math.abs(Date.now() - clock.lastActionAt) * clock.playSpeed
			: 0

		this.actualTimeElapsedMs = timeSinceLastAction + clock.lastTimeElapsedMs
	}

	tick() {
		this.calculateActualTimeElapsedMs()
		if (clock.isPlaying) {
			requestAnimationFrame(this.tick)
		}
	}

	toggleIsPlaying(isPlaying: boolean) {
		this.isPlaying = isPlaying
		if (isPlaying) {
			enableNoSleep()
			setClock({
				lastActionAt: Date.now(),
				// todo: recalculate at time of action
				// instead of using Signal
				lastTimeElapsedMs: getTimeElapsed(),
				isPlaying,
			})
			this.tick()
		} else {
			disableNoSleep()
		}
	}

	setClock(value: Partial<typeof clock>) {
		Object.assign(this, value)
		this.calculateActualTimeElapsedMs()
	}
}

export const clock = new ClockStore()

export const setClock = (value: Partial<typeof clock>) => clock.setClock(value)
export const getTimeElapsed = () => clock.actualTimeElapsedMs

export const getTimeElapsedAsDuration = () => {
	const d = Duration.fromMillis(getTimeElapsed()).shiftTo(
		'hours',
		'minutes',
		'seconds',
		'milliseconds',
	)
	// console.log(d);
	return d
}

export const TEXT_SIZES = [
	'text-sm',
	'text-base',
	'text-[32px]',
	'text-[64px]',
] as const
type TextSize = (typeof TEXT_SIZES)[number]

const textSize = mobx.observable.box<TextSize>('text-[32px]')
export const getTextSize = () => textSize.get()
export const setTextSize = (value: TextSize) => textSize.set(value)

const file = mobx.observable.box<DbLine[]>()
export const getFile = () => file.get()
export const setFile = (value: DbLine[]) => file.set(value)

export interface DbLine {
	id: string
	fileId: string
	originalId: string
	text: string
	from: number
	to: number
}

interface MyDB extends DBSchema {
	files: {
		key: string
		value: {
			id: string
			name: string
			/** length of file (TBD) */
			length?: any
			watched?: boolean
			progress?: string
		}
	}
	lines: {
		key: string
		value: DbLine
		indexes: {
			'by-file-id': string
		}
	}
}

export const initAndGetDb = once(async () => {
	const db = await openDB<MyDB>('subtitle-app', 1, {
		async upgrade(db, oldVersion, newVersion, transaction) {
			let currentVersion = oldVersion
			console.log(`Upgrading db from version ${oldVersion} to ${newVersion}`)

			if (currentVersion === 0) {
				db.createObjectStore('files', {
					keyPath: 'id',
				})
				db.createObjectStore('lines', {
					keyPath: 'id',
				}).createIndex('by-file-id', 'fileId')
			}
		},
	})

	console.log('created db!', db)
	;(window as any).db = db

	return db
})

export const addFileToDatabase = async (text: string, fileName: string) => {
	// console.log(`analyzing text for ${fileName}`, text)
	// const text = await file.text();
	const { entries } = parse(text)

	const db = await initAndGetDb()

	const fileId = nanoid()

	const tx = db.transaction(['files', 'lines'], 'readwrite')

	tx.objectStore('files').add({
		id: fileId,
		name: fileName,
	})

	const lines = tx.objectStore('lines')

	await Promise.all(
		entries.map((entry) => {
			const { id: originalId, text, ...remaining } = entry
			return lines.add({
				id: nanoid(),
				fileId,
				// sometimes originalId and text
				// have an extra /r at the end,
				// etc, so trim them
				originalId: originalId.trim(),
				text: text.trim(),
				...remaining,
			})
		}),
	)

	tx.commit()

	console.log('done adding')
}
