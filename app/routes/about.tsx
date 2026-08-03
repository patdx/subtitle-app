import { Block, Navbar, Page, List, ListItem } from '~/components'
import { Button } from '~/components/ui/button'
import type { Route } from './+types/about'
import { useNavigate } from 'react-router'
import {
	buttonChrome,
	canGoBack,
	cn,
	deleteLocalDatabase,
} from '~/shared/utils'
import { syncState, syncStore } from '~/shared/sync'

export function meta({}: Route.MetaArgs) {
	return [{ title: 'About - Subtitle App' }]
}

async function resetAllLocalData() {
	const confirmed = window.confirm(
		'Reset all local data? This clears your subtitle library, settings, and sync membership on this device. Nothing can be recovered.',
	)
	if (!confirmed) return

	try {
		if (syncState.joinedGroupCode) {
			await syncStore.leaveGroup()
		} else if (syncState.wasSharing || syncState.role === 'peer') {
			await syncStore.stopSharing()
		} else {
			syncStore.reset()
		}
	} catch (err) {
		console.error('Failed to leave sync before reset', err)
		syncStore.reset()
	}

	await deleteLocalDatabase()
	window.location.assign('/')
}

export default function About({}: Route.ComponentProps) {
	let navigate = useNavigate()

	return (
		<Page>
			<Navbar
				title="About"
				left={
					<Button
						onClick={() => {
							if (canGoBack()) {
								navigate(-1)
							} else {
								navigate('/')
							}
						}}
						className={buttonChrome}
					>
						Back
					</Button>
				}
			/>
			<Block className="px-4">
				<p className="max-w-prose text-sm text-ink-500">
					Subtitle App is a mobile-friendly tool for watching videos with SRT
					and VTT subtitles. It keeps your library on-device and pairs devices
					directly over WebRTC.
				</p>
				<p className="mt-2 text-sm text-ink-500">
					Built by{' '}
					<a
						href="https://github.com/patdx"
						target="_blank"
						rel="noreferrer"
						className="text-ember-600 hover:text-ember-700"
					>
						patdx
					</a>
					.
				</p>
			</Block>

			<List>
				<ListItem title="Visit patdx on GitHub" asChild>
					<a href="https://github.com/patdx" target="_blank" rel="noreferrer" />
				</ListItem>
				<ListItem title="View the Subtitle App repository" asChild>
					<a
						href="https://github.com/patdx/subtitle-app"
						target="_blank"
						rel="noreferrer"
					/>
				</ListItem>
			</List>

			<Block className="px-4 pt-8 pb-safe-or-8">
				<p className="text-base font-medium text-ink-900">Local data</p>
				<p className="mt-1 max-w-prose text-sm text-ink-500">
					Clears the on-device library, settings, and sync membership. Prefer
					this over keeping old data shapes around.
				</p>
				<Button
					variant="secondary"
					className={cn(
						buttonChrome,
						'mt-3 border-destructive text-destructive',
					)}
					onClick={() => {
						void resetAllLocalData()
					}}
				>
					Reset all local data
				</Button>
			</Block>
		</Page>
	)
}
