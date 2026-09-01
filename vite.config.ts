import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const pr = process.env.VELOSYNC_PR?.trim() || ''
const base = pr ? `/velosync/pr/${pr}/` : '/velosync/'
const appName = pr ? 'VeloSync PR' : 'VeloSync'

export default defineConfig({
  base,
  plugins: [
    react(),
    {
      name: 'html-pr-chrome',
      transformIndexHtml(html) {
        if (!pr) return html
        return html.replace('<title>VeloSync</title>', '<title>VeloSync PR</title>')
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'logos/velosync-vs-mark.jpeg',
        'logos/velosync-horizontal.jpeg',
      ],
      manifest: {
        id: base,
        name: appName,
        short_name: appName,
        start_url: base,
        scope: base,
        description: pr
          ? 'Preview build of VeloSync'
          : 'Softball pitch tracking and scouting',
        theme_color: '#e8eef7',
        background_color: '#e8eef7',
        display: 'standalone',
        icons: [
          {
            src: 'logos/velosync-vs-mark.jpeg',
            sizes: '1152x1728',
            type: 'image/jpeg',
            purpose: 'any',
          },
          {
            src: 'logos/velosync-vs-mark.jpeg',
            sizes: '1152x1728',
            type: 'image/jpeg',
            purpose: 'maskable',
          },
        ],
      },
      // Main SW scope is /velosync/; never intercept PR preview URLs.
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpeg,jpg,woff,woff2,webmanifest}'],
        navigateFallbackDenylist: [/^\/velosync\/pr\//],
      },
    }),
  ],
})
