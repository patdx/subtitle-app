import { reactRouter } from '@react-router/dev/vite'
import { defineConfig } from 'vite'
import AutoImport from 'unplugin-auto-import/vite'
import tailwindcss from '@tailwindcss/vite'
import { qrcode } from 'vite-plugin-qrcode'

export default defineConfig(({ isSsrBuild }) => ({
	server: {
		watch: {},
	},
	resolve: {
		tsconfigPaths: true,
	},
	plugins: [
		AutoImport({
			imports: ['react'],
			dirs: ['./app/shared'],
		}),
		reactRouter(),
		tailwindcss(),
		qrcode(), // only applies in dev mode
	],
}))
