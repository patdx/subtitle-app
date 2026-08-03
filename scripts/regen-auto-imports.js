import AutoImport from 'unplugin-auto-import/vite'
import { autoImportOptions } from './auto-import-options.js'

await AutoImport(autoImportOptions).buildStart()
