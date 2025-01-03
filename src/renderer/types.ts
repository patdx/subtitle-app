import type { JSX } from 'solid-js'
import type {
	PageContextServer
} from 'vike/types'
export type PageProps = {}
export type PageContext = PageContextServer & {
	Page: (pageProps: PageProps) => JSX.Element
	pageProps: PageProps
	documentProps?: {
		title?: string
		description?: string
	}
}
