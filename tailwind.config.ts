import type { Config } from 'tailwindcss'

export default {
	content: ['./app/**/{**,.client,.server}/**/*.{js,jsx,ts,tsx}'],
	theme: {
		extend: {
			screens: {
				pwa: { raw: '(display-mode: standalone)' },
			},
		},
	},
	plugins: [],
} satisfies Config
