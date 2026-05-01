
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

const buildVersion = process.env.COMMIT_REF || String(Date.now());

export default defineConfig({
    define: {
        __APP_VERSION__: JSON.stringify(buildVersion),
    },
    server: {
        host: true,
        port: 5173,
        strictPort: true,
        headers: {
            'Cache-Control': 'no-store',
        },
    },
    plugins: [
        vue(),
        {
            name: 'inject-build-version',
            transformIndexHtml(html) {
                return html.replace('__APP_VERSION__', buildVersion);
            },
        },
        VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'auto',
            manifest: {
                name: 'WAGS',
                short_name: 'WAGS',
                theme_color: '#181818',
                background_color: '#181818',
                display: 'standalone',
                start_url: '.',
                icons: [
                    {
                        src: '/golfball-192.png',
                        sizes: '192x192',
                        type: 'image/png',
                    },
                    {
                        src: '/golfball-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                    },
                ],
            },
            workbox: {
                cleanupOutdatedCaches: true,
                skipWaiting: true,
                clientsClaim: true,
                navigateFallback: '/index.html',
                navigateFallbackDenylist: [/^\/api\//],
                additionalManifestEntries: [
                    {
                        url: '/',
                        revision: process.env.COMMIT_REF || String(Date.now()),
                    },
                ],
            },
            devOptions: {
                enabled: false,
            },
        }),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
})