import type { Config } from 'tailwindcss'
import konstaConfig from 'konsta/config'

const config = {
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

export default konstaConfig(config)
