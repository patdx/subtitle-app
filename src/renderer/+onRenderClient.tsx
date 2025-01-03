import { hydrate, render as solidRender } from 'solid-js/web'
import 'tailwindcss/tailwind.css'
import type { PageContext } from './types'

let dispose: () => void

export function onRenderClient(pageContext: PageContext) {
	console.log(`pageContext`, pageContext)
	const content = document.getElementById('app')
	const { Page, pageProps } = pageContext

	// Dispose to prevent duplicate pages when navigating.
	if (dispose) dispose()

	// Render the page
	if (pageContext.isHydration) {
		// This is the first page rendering; the page has been rendered to HTML
		// and we now make it interactive.
		dispose = hydrate(() => <Page {...pageProps} />, content!)
	} else {
		// Render new page
		solidRender(() => <Page {...pageProps} />, content!)
	}
}
