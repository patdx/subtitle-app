import type { Config } from '@react-router/dev/config'

export default {
	// Config options...
	// Server-side render by default, to enable SPA mode set this to `false`
	// ssr: false,
	ssr: false,
	async prerender() {
		return ['/', '/play']
	},
	future: {
		unstable_optimizeDeps: true,
	},
} satisfies Config
