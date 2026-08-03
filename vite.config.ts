import { reactRouter } from '@react-router/dev/vite'
import { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'
import AutoImport from 'unplugin-auto-import/vite'
import Icons from 'unplugin-icons/vite'
import tailwindcss from '@tailwindcss/vite'
import { qrcode } from 'vite-plugin-qrcode'
import { autoImportOptions } from './scripts/auto-import-options.js'

export default defineConfig(() => ({
	server: {
		watch: {},
	},
	resolve: {
		tsconfigPaths: true,
	},
	plugins: [
		AutoImport(autoImportOptions),
		Icons({
			compiler: 'jsx',
			jsx: 'react',
			scale: 1,
			defaultClass: 'size-6',
		}),
		reactRouter(),
		babel({
			include: /\.[jt]sx?$/,
			presets: [
				reactCompilerPreset({
					panicThreshold: 'all_errors',
				}),
			],
		}),
		tailwindcss(),
		qrcode(), // only applies in dev mode
	],
}))
