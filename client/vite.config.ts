import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'The Decision Room',
        short_name: 'Decision Room',
        description: 'An 8–10 minute human judgment versus model judgment workshop.',
        theme_color: '#f1ff00',
        background_color: '#070807',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': `http://127.0.0.1:${process.env.API_PORT ?? '3001'}`,
    },
  },
})
