import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

import ssr from 'vite-plugin-ssr/plugin';

export default defineConfig({
  define: {
    // global: 'globalThis',
    // 'process.env.NODE_DEBUG': 'false',
    // 'process.browser': 'true',
  },
  plugins: [
    solidPlugin({ ssr: true }),
    //  shimReactPdf(),
    ssr(),
  ],
  build: {
    target: 'esnext',
    polyfillDynamicImport: false,
  },
});
