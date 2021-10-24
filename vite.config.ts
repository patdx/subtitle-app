import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import ssr from 'vite-plugin-ssr/plugin';
import { execSync } from 'child_process';

const gitpodHost = (() => {
  try {
    return execSync(`gp url 3001`)
      .toString('utf8')
      .replace(/^https:\/\//, '');
  } catch {
    return undefined;
  }
})();

console.log(`gitpodHost: ${gitpodHost}`);

export default defineConfig({
  // begin config for gitpod
  server: {
    port: 3000,
    hmr: {
      port: 3001,
      clientPort: 443,
      ...(gitpodHost
        ? {
            host: gitpodHost,
          }
        : {}),
    },
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
