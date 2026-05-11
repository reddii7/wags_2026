
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

const shellBuildId =
    process.env.NETLIFY_DEPLOY_ID ||
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.COMMIT_REF ||
    process.env.NETLIFY_COMMIT ||
    'local'

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
        {
            name: 'wags-shell-build',
            transformIndexHtml(html) {
                return html.replaceAll('__WAGS_SHELL_BUILD__', shellBuildId)
            },
        },
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
})