/** @type {import('unplugin-auto-import/types').Options} */
export const autoImportOptions = {
	imports: ['react'],
	dirs: ['./app/shared'],
	dirsScanOptions: {
		fileFilter: (file) =>
			!file.includes('sync-group') &&
			!file.includes('sync-harness') &&
			!file.endsWith('.test.ts'),
	},
	dtsMode: 'overwrite',
}
