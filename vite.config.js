import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import webExtension from 'vite-plugin-web-extension';

export default defineConfig(({ mode }) => ({
  // Trace logging (DiscourseCopilotLogger.log) is on only for `pnpm dev`
  // (--mode development); every other build, including `pnpm build`, drops it.
  define: {
    'import.meta.env.DEV': JSON.stringify(mode === 'development')
  },
  plugins: [
    webExtension({
      manifest: './manifest.json',
      // The content script is registered at runtime (per granted forum) with
      // chrome.scripting, so the manifest no longer references it. Build it
      // as a standalone script at the path FORUM_CONTENT_SCRIPT_FILE names.
      additionalInputs: ['src/content/content.js'],
      // web-ext-run is stubbed (tools/stubs/web-ext-run); never launch a browser.
      disableAutoLaunch: true
    })
  ],
  build: {
    outDir: 'dist',
    target: 'esnext',
    minify: false
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src')
    }
  }
}));
