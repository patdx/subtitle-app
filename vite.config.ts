import { reactRouter } from '@react-router/dev/vite'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import AutoImport from 'unplugin-auto-import/vite'
import tailwindcss from '@tailwindcss/vite'
import { qrcode } from 'vite-plugin-qrcode'

export default defineConfig(({ isSsrBuild }) => ({
	server: {
		watch: {},
	},
	plugins: [
		AutoImport({
			imports: ['react'],
			dirs: ['./app/shared'],
		}),
		reactRouter(),
		tsconfigPaths(),
		tailwindcss(),
		qrcode(), // only applies in dev mode
	],
}))
