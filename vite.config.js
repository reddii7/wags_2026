
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
    plugins: [
        vue(),
        VitePWA({
            registerType: 'autoUpdate',
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
            },
            devOptions: {
                enabled: true,
            },
        }),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
})