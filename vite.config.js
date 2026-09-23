import { defineConfig } from 'vite';
import { resolve } from 'path';
import webExtension from 'vite-plugin-web-extension';

export default defineConfig({
  plugins: [
    webExtension({
      manifest: './manifest.json'
    })
  ],
  build: {
    outDir: 'dist',
    target: 'esnext',
    minify: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: false
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});
