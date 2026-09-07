import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
let commit = process.env.GITHUB_SHA?.slice(0, 7);
if (!commit) { try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { commit = 'local'; } }
export default defineConfig({
  base: '/FORGET-ME-KNOT/',
  define: { __BUILD__: JSON.stringify(`0.1.0 · ${commit}`) },
  plugins: [react(), VitePWA({
    registerType: 'prompt', injectRegister: null,
    includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
    manifest: {
      id: '/FORGET-ME-KNOT/', name: 'Forget Me Knot', short_name: 'Forget Me Knot',
      description: 'Your passwords, a little easier.', start_url: '/FORGET-ME-KNOT/', scope: '/FORGET-ME-KNOT/',
      display: 'standalone', background_color: '#101514', theme_color: '#101514',
      icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
    },
    workbox: { globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'], navigateFallback: 'index.html', cleanupOutdatedCaches: true },
  })],
});
