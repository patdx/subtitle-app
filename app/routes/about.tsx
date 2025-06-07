import {
	Block,
	Navbar,
	NavbarBackLink,
	Page,
	List,
	ListItem,
} from '~/components'
import type { Route } from './+types/_index'
import { Link, useNavigate } from 'react-router'

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
					<NavbarBackLink onClick={() => navigate(-1)}>Back</NavbarBackLink>
				}
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
