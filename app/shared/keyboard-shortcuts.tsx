import { useSnapshot } from 'valtio'
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from '~/components/ui/sheet'
import { controlState, toggleKeyboardHelp } from './utils'

const SHORTCUT_GROUPS = [
	{
		title: 'Playback',
		shortcuts: [
			{ keys: ['Space', 'K'], label: 'Play or pause' },
			{ keys: ['J', '←'], label: 'Back 10 seconds' },
			{ keys: ['L', '→'], label: 'Forward 10 seconds' },
			{ keys: [',', '.'], label: 'Step 1 second' },
		],
	},
	{
		title: 'Navigation',
		shortcuts: [
			{ keys: ['0–9'], label: 'Jump to a percentage' },
			{ keys: ['<', '>'], label: 'Change playback speed' },
			{ keys: ['F'], label: 'Toggle fullscreen' },
			{ keys: ['Esc'], label: 'Hide controls' },
		],
	},
] as const

export const KeyboardShortcuts = () => {
	const controlSnap = useSnapshot(controlState)

	return (
		<Sheet
			open={controlSnap.showKeyboardHelp}
			onOpenChange={(open) => {
				if (open !== controlState.showKeyboardHelp) toggleKeyboardHelp()
			}}
		>
			<SheetContent
				side="right"
				className="w-[min(24rem,90vw)] border-l border-white/10 bg-ink-950 text-white"
			>
				<SheetHeader className="border-b border-white/10 pr-14">
					<SheetTitle className="text-white">Keyboard shortcuts</SheetTitle>
					<SheetDescription className="text-ink-400">
						Control playback without leaving the keyboard.
					</SheetDescription>
				</SheetHeader>
				<div className="flex flex-col gap-6 overflow-y-auto px-4 pb-safe-or-6">
					{SHORTCUT_GROUPS.map((group) => (
						<section
							key={group.title}
							aria-labelledby={`shortcut-${group.title}`}
						>
							<h2
								id={`shortcut-${group.title}`}
								className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500"
							>
								{group.title}
							</h2>
							<dl className="divide-y divide-white/10">
								{group.shortcuts.map((shortcut) => (
									<div
										key={shortcut.label}
										className="flex items-center justify-between gap-4 py-3"
									>
										<dt className="text-ink-200">{shortcut.label}</dt>
										<dd className="flex gap-1">
											{shortcut.keys.map((key) => (
												<kbd
													key={key}
													className="min-w-7 rounded border border-white/15 bg-white/8 px-1.5 py-1 text-center font-mono text-xs text-white shadow-sm"
												>
													{key}
												</kbd>
											))}
										</dd>
									</div>
								))}
							</dl>
						</section>
					))}
				</div>
			</SheetContent>
		</Sheet>
	)
}
