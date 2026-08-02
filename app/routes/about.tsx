import {
	Block,
	Navbar,
	Page,
	List,
	ListItem,
} from '~/components'
import { Button } from '~/components/ui/button'
import type { Route } from './+types/about'
import { Link, useNavigate } from 'react-router'
import { buttonChrome, canGoBack } from '~/shared/utils'

export function meta({}: Route.MetaArgs) {
	return [{ title: 'About - Subtitle App' }]
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
		</Page>
	)
}
