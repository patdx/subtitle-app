import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

import ssr from 'vite-plugin-ssr/plugin';

export default defineConfig({
  // begin config for gitpod
  server: {
    port: 3000,
    hmr: {
      port: 3001,
      clientPort: 443,
      host: "3001-indigo-ant-u6pyxf1a.ws-us17.gitpod.io"
    }
  },
  // end config for gitpod

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
