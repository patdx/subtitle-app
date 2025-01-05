import { reactRouter } from '@react-router/dev/vite'
import autoprefixer from 'autoprefixer'
import tailwindcss from 'tailwindcss'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import AutoImport from 'unplugin-auto-import/vite'

export default defineConfig(({ isSsrBuild }) => ({
	server: {
		watch: {},
	},
	css: {
		postcss: {
			plugins: [tailwindcss, autoprefixer],
		},
	},
	plugins: [
		AutoImport({
			imports: ['react'],
			dirs: ['./app/shared'],
		}),
		reactRouter(),
		tsconfigPaths(),
	],
}))
