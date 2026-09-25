import { defineConfig } from 'vite';
import { resolve } from 'path';
import webExtension from 'vite-plugin-web-extension';

export default defineConfig({
  plugins: [
    webExtension({
      manifest: './manifest.json',
      // The content script is registered at runtime (per granted forum) with
      // chrome.scripting, so the manifest no longer references it. Build it
      // as a standalone script at the path FORUM_CONTENT_SCRIPT_FILE names.
      additionalInputs: ['src/content/content.js']
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
});
