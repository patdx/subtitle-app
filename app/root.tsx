import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as konsta from '~/components'
import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useRouteLoaderData,
} from 'react-router'
import type { Route } from './+types/root'
import stylesheet from './app.css?url'

export const links: Route.LinksFunction = () => [
	// { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
	// {
	// 	rel: 'preconnect',
	// 	href: 'https://fonts.gstatic.com',
	// 	crossOrigin: 'anonymous',
	// },
	// {
	// 	rel: 'stylesheet',
	// 	href: 'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap',
	// },
	{ rel: 'stylesheet', href: stylesheet },
]

// Create a client
const queryClient = new QueryClient()

export function clientLoader() {
	const isIos = window.navigator.userAgent.match(/iPhone|iPad|iPod/i)
	return {
		isIos,
	}
}

export function Layout({ children }: { children: React.ReactNode }) {
	const { isIos } = useRouteLoaderData<typeof clientLoader>('root') ?? {}

	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta
					name="viewport"
					content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover"
				/>
				<link
					rel="manifest"
					href="/webmanifest.json"
					crossOrigin="use-credentials"
				/>
				<meta name="apple-mobile-web-app-capable" content="yes" />
				<meta
					name="apple-mobile-web-app-status-bar-style"
					content="black-translucent"
				/>
				<link
					rel="apple-touch-icon"
					sizes="180x180"
					href="/apple-touch-icon.png"
				/>
				<link
					rel="icon"
					type="image/png"
					sizes="32x32"
					href="/favicon-32x32.png"
				/>
				<link
					rel="icon"
					type="image/png"
					sizes="16x16"
					href="/favicon-16x16.png"
				/>
				<meta name="disabled-adaptations" content="watch" />
				<meta name="format-detection" content="telephone=no" />
				<meta name="msapplication-tap-highlight" content="no" />
				<Meta />
				<Links />
			</head>
			<body>
				<QueryClientProvider client={queryClient}>
					<konsta.App safeAreas theme={isIos ? 'ios' : 'material'}>
						{children}
					</konsta.App>
				</QueryClientProvider>
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	)
}

// const isIosStandalone = globalThis.navigator

// https://thomashunter.name/posts/2021-12-11-detecting-if-pwa-twa-is-installed

export default function App() {
	return <Outlet />
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	let message = 'Oops!'
	let details = 'An unexpected error occurred.'
	let stack: string | undefined

	if (isRouteErrorResponse(error)) {
		message = error.status === 404 ? '404' : 'Error'
		details =
			error.status === 404
				? 'The requested page could not be found.'
				: error.statusText || details
	} else if (import.meta.env.DEV && error && error instanceof Error) {
		details = error.message
		stack = error.stack
	}

	return (
		<main className="pt-16 p-4 container mx-auto">
			<h1>{message}</h1>
			<p>{details}</p>
			{stack && (
				<pre className="w-full p-4 overflow-x-auto">
					<code>{stack}</code>
				</pre>
			)}
		</main>
	)
}
