import { VitePWAOptions } from 'vite-plugin-pwa';

export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'autoUpdate',
  workbox: {
    clientsClaim: true,
    skipWaiting: true,
    cleanupOutdatedCaches: true,
    globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
    navigateFallback: 'index.html',
  },
  manifest: {
    name: 'JJ CHAT',
    short_name: 'JJ',
    description: 'A Progressive Web App built with React and Vite.',
    theme_color: '#000000',
    icons: [
      {
        src: 'icons/icon-192x192.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
      },
      {
        src: 'icons/icon-512x512.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
      },
    ],
  },
};