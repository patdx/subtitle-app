import { seekBy, seekTo, setPlaySpeed, togglePlayback } from './sync'
import {
	clock,
	controlState,
	getDuration,
	PLAYBACK_SPEEDS,
	pokeControls,
	toggleFullscreen,
	toggleKeyboardHelp,
	uiState,
	unfadeControls,
} from './utils'

function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false
	if (target.isContentEditable) return true
	const tag = target.tagName
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/** True when a menu, dialog, or similar overlay should own the keyboard. */
function isOverlayOpen(): boolean {
	return Boolean(
		document.querySelector(
			'[role="menu"], [role="listbox"], [role="dialog"], [data-slot="menu-popup"], [data-slot="sheet-content"]',
		),
	)
}

function stepPlaySpeed(direction: -1 | 1) {
	const speeds = PLAYBACK_SPEEDS as readonly number[]
	const current = clock.playSpeed
	const index = speeds.indexOf(current)
	const fallback = direction > 0 ? 0 : speeds.length - 1
	const nextIndex =
		index === -1
			? fallback
			: Math.min(speeds.length - 1, Math.max(0, index + direction))
	const next = speeds[nextIndex]
	if (next !== undefined && next !== current) {
		setPlaySpeed(next)
	}
}

function seekToPercent(tenth: number) {
	const duration = getDuration(uiState.file)
	if (!duration || duration <= 0) return
	seekTo((duration * tenth) / 10)
}

/**
 * Netflix-style player shortcuts while the play route is mounted.
 * Volume/mute are omitted (subtitle-only clock, no media audio).
 */
export function usePlayerKeyboard() {
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return
			if (isEditableTarget(e.target)) return
			if (isOverlayOpen()) return

			let handled = true
			let keepControlsVisible = true

			switch (e.key) {
				case ' ':
				case 'k':
				case 'K':
					togglePlayback()
					break
				case 'ArrowLeft':
				case 'j':
				case 'J':
					seekBy(-10000)
					break
				case 'ArrowRight':
				case 'l':
				case 'L':
					seekBy(10000)
					break
				case ',':
					seekBy(-1000)
					break
				case '.':
					seekBy(1000)
					break
				case '<':
					stepPlaySpeed(-1)
					break
				case '>':
					stepPlaySpeed(1)
					break
				case 'f':
				case 'F':
					if (!controlState.fullScreenEnabled) {
						handled = false
						break
					}
					void toggleFullscreen()
					break
				case '?':
					toggleKeyboardHelp()
					break
				case 'Escape':
					if (document.fullscreenElement) {
						void document.exitFullscreen()
					} else {
						controlState.faded = true
						keepControlsVisible = false
					}
					break
				case '0':
				case '1':
				case '2':
				case '3':
				case '4':
				case '5':
				case '6':
				case '7':
				case '8':
				case '9':
					seekToPercent(Number(e.key))
					break
				default:
					handled = false
			}

			if (!handled) return

			e.preventDefault()
			if (keepControlsVisible) {
				unfadeControls()
				pokeControls()
			}
		}

		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [])
}
