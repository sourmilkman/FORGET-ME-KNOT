import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
let commit = process.env.GITHUB_SHA?.slice(0, 7);
if (!commit) { try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { commit = 'local'; } }
export default defineConfig({
  base: '/FORGET-ME-KNOT/',
  define: { __BUILD__: JSON.stringify(`0.2.2 · ${commit}`) },
  build: { rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), mum: resolve(import.meta.dirname, 'mum.html') } } },
  plugins: [react(), VitePWA({
    registerType: 'prompt', injectRegister: null,
    includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
    manifest: false,
    workbox: { globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'], navigateFallback: 'index.html', cleanupOutdatedCaches: true },
  })],
});
