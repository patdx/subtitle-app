import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import shimReactPdf from 'vite-plugin-shim-react-pdf';

export default defineConfig({
  define: {
    global: 'globalThis',
    'process.env.NODE_DEBUG': 'false',
    'process.browser': 'true',
  },
  plugins: [solidPlugin(), shimReactPdf()],
  build: {
    target: 'esnext',
    polyfillDynamicImport: false,
  },
});
