
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
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
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
})