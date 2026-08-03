import { proxy } from 'valtio'
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

/** App-wide button chrome: the shadcn default is compact, the product language
 * is roomier. Applied to every Button via cn(). */
export const buttonChrome = 'h-auto rounded-lg px-4 py-2 text-sm font-semibold'

/** The app may be opened directly via a QR code or external link, leaving no
 * previous history entry to go back to. */
export function canGoBack() {
	return window.history.length > 1
}

// SRT/VTT files may contain inline HTML (b/i/u/font/br).
// Render only a safe whitelist and strip all attributes so
// malicious markup from subtitle files cannot execute.
const ALLOWED_SUBTITLE_TAGS = new Set([
	'B',
	'I',
	'U',
	'STRONG',
	'EM',
	'FONT',
	'BR',
	'SPAN',
])
const DROP_SUBTITLE_TAGS = new Set([
	'SCRIPT',
	'STYLE',
	'IFRAME',
	'OBJECT',
	'EMBED',
	'SVG',
	'MATH',
	'VIDEO',
	'AUDIO',
	'IMG',
	'LINK',
	'META',
	'TEMPLATE',
	'FORM',
	'INPUT',
])

const sanitizeCache = new Map<string, string>()

export function sanitizeSubtitleHtml(html: string): string {
	const cached = sanitizeCache.get(html)
	if (cached !== undefined) return cached

	const doc = new DOMParser().parseFromString(html, 'text/html')

	const walk = (el: Element) => {
		for (const child of [...el.children]) {
			if (DROP_SUBTITLE_TAGS.has(child.tagName)) {
				child.remove()
				continue
			}
			// sanitize descendants before moving them up, otherwise
			// malicious markup nested inside an unknown wrapper tag
			// would survive the unwrap untouched
			walk(child)
			if (!ALLOWED_SUBTITLE_TAGS.has(child.tagName)) {
				while (child.firstChild) {
					el.insertBefore(child.firstChild, child)
				}
				child.remove()
				continue
			}
			for (const attr of [...child.attributes]) {
				child.removeAttribute(attr.name)
			}
		}
	}

	walk(doc.body)

	const result = doc.body.innerHTML
	sanitizeCache.set(html, result)
	if (sanitizeCache.size > 200) {
		const oldest = sanitizeCache.keys().next().value
		if (oldest !== undefined) {
			sanitizeCache.delete(oldest)
		}
	}
	return result
}

export interface Entry {
	id: string
	from: number
	to: number
	text: string
}

export const nodeIsActive = (node: Entry, currentTime: number): boolean => {
	return currentTime >= node.from && currentTime < node.to
}

export const getActiveNodes = (
	nodes: readonly Entry[] = [],
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
		const last = findLast(nodes, (node) => node.to < currentTime)

		if (last) {
			selectedNodes.add(last as any)
		}
		// no active nodes, find the next closest node
		const next = nodes.find((node) => node.from > currentTime)

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

export const controlState = proxy({
	/** controls are auto-hidden after a period of inactivity */
	faded: false,
	/** bumped on interaction to reset the auto-fade timer */
	activity: 0,
	/**
	 * fullscreen support is client-only; set after hydration so the
	 * prerendered HTML matches the client's first render
	 */
	fullScreenEnabled: false,
	showTranscript: false,
})

export const pokeControls = () => {
	controlState.activity += 1
}
export const unfadeControls = () => {
	controlState.faded = false
}
export const enableFullScreenButton = () => {
	controlState.fullScreenEnabled = true
}
export const toggleTranscript = () => {
	controlState.showTranscript = !controlState.showTranscript
}

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

export const clock = proxy({
	lastActionAt: Date.now(),
	lastTimeElapsedMs: 0,
	playSpeed: 1,
	isPlaying: false,
	/** is calculated based on lastActionAt, playSpeed and lastTimeElapsedMs */
	actualTimeElapsedMs: 0,
})

/** true while the requestAnimationFrame tick loop is scheduled */
let ticking = false

export const calculateActualTimeElapsedMs = () => {
	const timeSinceLastAction = clock.isPlaying
		? Math.abs(Date.now() - clock.lastActionAt) * clock.playSpeed
		: 0

	clock.actualTimeElapsedMs = timeSinceLastAction + clock.lastTimeElapsedMs
}

export const tick = () => {
	calculateActualTimeElapsedMs()
	if (clock.isPlaying) {
		requestAnimationFrame(tick)
	} else {
		ticking = false
	}
}

export const toggleIsPlaying = (isPlaying: boolean) => {
	clock.isPlaying = isPlaying
	if (isPlaying) {
		enableNoSleep()
		setClock({
			lastActionAt: Date.now(),
			// todo: recalculate at time of action
			// instead of using Signal
			lastTimeElapsedMs: getTimeElapsed(),
			isPlaying,
		})
		if (!ticking) {
			ticking = true
			tick()
		}
	} else {
		disableNoSleep()
		setClock({
			lastActionAt: Date.now(),
			lastTimeElapsedMs: getTimeElapsed(),
			isPlaying,
		})
	}
}

export const setClock = (value: Partial<typeof clock>) => {
	Object.assign(clock, value)
	calculateActualTimeElapsedMs()
}

export const getTimeElapsed = () => clock.actualTimeElapsedMs

export const getTimeElapsedAsDuration = (ms: number = getTimeElapsed()) => {
	const d = Duration.fromMillis(ms).shiftTo(
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

export const uiState = proxy({
	textSize: 'text-[32px]' as TextSize,
	file: undefined as DbLine[] | undefined,
})

export const getTextSize = () => uiState.textSize
export const setTextSize = (value: TextSize) => {
	uiState.textSize = value
}

export const getFile = () => uiState.file
export const setFile = (value: DbLine[]) => {
	uiState.file = value
}

export const getDuration = (
	lines: readonly DbLine[] | undefined = getFile(),
): number => {
	if (!lines || lines.length === 0) return 0
	return lines[lines.length - 1].to
}

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
			/** content hash used as the cross-device file identity */
			hash?: string
			/** length of file (TBD) */
			length?: any
			watched?: boolean
			progress?: number
			lastPlayed?: number
		}
	}
	lines: {
		key: string
		value: DbLine
		indexes: {
			'by-file-id': string
		}
	}
	settings: {
		key: string
		value: { key: string; value: unknown }
	}
}

export const initAndGetDb = once(async () => {
	const db = await openDB<MyDB>('subtitle-app', 2, {
		async upgrade(db, oldVersion, newVersion, transaction) {
			let currentVersion = oldVersion

			if (currentVersion === 0) {
				db.createObjectStore('files', {
					keyPath: 'id',
				})
				db.createObjectStore('lines', {
					keyPath: 'id',
				}).createIndex('by-file-id', 'fileId')
				currentVersion = 1
			}

			if (currentVersion < 2) {
				db.createObjectStore('settings', {
					keyPath: 'key',
				})
			}
		},
	})

	return db
})

export const getSetting = async <T>(key: string): Promise<T | undefined> => {
	const db = await initAndGetDb()
	const entry = await db.get('settings', key)
	return entry?.value as T | undefined
}

export const setSetting = async (key: string, value: unknown) => {
	const db = await initAndGetDb()
	await db.put('settings', { key, value })
}

const formatTimestamp = (ms: number): string => {
	const pad = (n: number, width = 2) => String(n).padStart(width, '0')
	const hours = Math.floor(ms / 3_600_000)
	const minutes = Math.floor((ms % 3_600_000) / 60_000)
	const seconds = Math.floor((ms % 60_000) / 1000)
	const millis = ms % 1000
	return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`
}

/** Raw SRT text is not stored, only parsed lines; rebuild it for transfer. */
export const linesToSrtText = (lines: DbLine[]): string =>
	lines
		.map(
			(line, index) =>
				`${index + 1}\n${formatTimestamp(line.from)} --> ${formatTimestamp(line.to)}\n${line.text}\n`,
		)
		.join('\n')

/**
 * SHA-256 hex digest of a subtitle's canonical SRT text. The canonical text is
 * deterministic for the same parsed lines, so two devices that imported the
 * same file (or received it over a data channel) derive the same hash — that
 * hash is the cross-device file identity, replacing name-based matching.
 */
export const hashText = async (text: string): Promise<string> => {
	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(text),
	)
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('')
}

/** Fill in missing hashes for files imported before hashing existed. */
export const backfillFileHashes = once(async () => {
	const db = await initAndGetDb()
	const missing = (await db.getAll('files')).filter((file) => !file.hash)
	for (const file of missing) {
		const fileLines = await db.getAllFromIndex('lines', 'by-file-id', file.id)
		if (fileLines.length === 0) continue
		await db.put('files', {
			...file,
			hash: await hashText(linesToSrtText(fileLines)),
		})
	}
})

export const addFileToDatabase = async (text: string, fileName: string) => {
	// console.log(`analyzing text for ${fileName}`, text)
	// const text = await file.text();
	const { entries } = parse(text)

	const db = await initAndGetDb()

	const fileId = nanoid()

	const lines: DbLine[] = entries.map((entry) => {
		const { id: originalId, text: entryText, ...remaining } = entry
		return {
			id: nanoid(),
			fileId,
			// sometimes originalId and text
			// have an extra /r at the end,
			// etc, so trim them
			originalId: originalId.trim(),
			text: entryText.trim(),
			...remaining,
		}
	})

	const hash = await hashText(linesToSrtText(lines))

	const tx = db.transaction(['files', 'lines'], 'readwrite')

	tx.objectStore('files').add({
		id: fileId,
		name: fileName,
		hash,
		// duration of the subtitle track in ms (last cue's end time)
		length: entries.length > 0 ? entries[entries.length - 1].to : 0,
	})

	const lineStore = tx.objectStore('lines')
	await Promise.all(lines.map((line) => lineStore.add(line)))

	await tx.done

	return fileId
}
