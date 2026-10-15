import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { env } from 'node:process';
import unoCssPlugin from 'unocss/vite';
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

const isDemoMode = env.VITE_IS_DEMO_MODE === 'true';

export default defineConfig({
  plugins: [
    unoCssPlugin(),
    solidPlugin(),
    demoSecurityPlugin(),
  ],
  server: {
    port: Number(env.PORT || 3000),
    strictPort: true,
    proxy: {
      '/api/': {
        target: env.VITE_API_URL || 'http://localhost:1221',
      },
    },
  },
  build: {
    target: 'esnext',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['@pdfslick/solid'],
    include: ['debug', 'extend', 'style-to-object', 'ms', 'inherits', 'readable-stream'],
  },
  // test: {
  //   exclude: [...configDefaults.exclude, '**/*.e2e.test.ts'],
  // },
});

// The public demo must never talk to a backend: the CSP below makes the browser enforce it, whatever the code does.
// `frame-ancestors` can't be set from a meta tag, so it goes in the Cloudflare `_headers` file next to the build.
function demoSecurityPlugin(): Plugin {
  const frameAncestors = env.VITE_DEMO_FRAME_ANCESTORS
    ?? 'https://heypaqui.com https://www.heypaqui.com http://localhost:* http://127.0.0.1:*';
  const csp = [
    'default-src \'self\'',
    'script-src \'self\' \'unsafe-inline\'',
    'style-src \'self\' \'unsafe-inline\' https://fonts.bunny.net',
    'img-src \'self\' data: blob:',
    'font-src \'self\' data: https://fonts.bunny.net',
    'connect-src \'self\' data: blob:',
    'worker-src \'self\' blob:',
    'frame-src \'self\' blob: data:',
    'object-src \'self\' blob:',
    'form-action \'self\'',
    'base-uri \'self\'',
  ].join('; ');

  let outDir = path.resolve(__dirname, 'dist');

  return {
    name: 'demo-security',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    transformIndexHtml() {
      if (!isDemoMode) {
        return [];
      }

      return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', 'content': csp }, injectTo: 'head-prepend' }];
    },
    closeBundle() {
      if (!isDemoMode) {
        return;
      }

      const headers = `/*\n    Content-Security-Policy: ${csp}; frame-ancestors ${frameAncestors}\n    X-Content-Type-Options: nosniff\n    X-Robots-Tag: noindex, nofollow\n    Referrer-Policy: no-referrer\n`;
      fs.writeFileSync(path.join(outDir, '_headers'), headers);
      console.log(`[demo-security] Wrote demo CSP and frame-ancestors to ${path.relative(__dirname, outDir)}/_headers`);
    },
  };
}
