import {
	Block,
	Navbar,
	NavbarBackLink,
	Page,
	List,
	ListItem,
} from '~/components'
import type { Route } from './+types/_index'
import { useNavigate } from 'react-router'

export function meta({}: Route.MetaArgs) {
	return [{ title: 'About - Subtitle App' }]
}

export default function About({}: Route.ComponentProps) {
	let navigate = useNavigate()

	return (
		<Page>
			<Navbar
				title="About"
				large
				transparent
				centerTitle
				left={<NavbarBackLink text="Back" onClick={() => navigate(-1)} />}
			/>
			<Block className="px-4">
				<p className="text-sm text-gray-600">
					Subtitle App by{' '}
					<a href="https://github.com/patdx" target="_blank" rel="noreferrer">
						patdx
					</a>
					.
				</p>
			</Block>

			<List strongIos outlineIos>
				<ListItem
					link
					title="Visit patdx on GitHub"
					href="https://github.com/patdx"
					target="_blank"
					rel="noreferrer"
				/>
				<ListItem
					link
					title="View the Subtitle App repository"
					href="https://github.com/patdx/subtitle-app"
					target="_blank"
					rel="noreferrer"
				/>
			</List>
		</Page>
	)
}
