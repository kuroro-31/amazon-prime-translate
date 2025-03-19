import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.OPENAI_API_KEY': JSON.stringify('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')
  },
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'index.html'),
        content: resolve(__dirname, 'src/content/content.ts'),
        background: resolve(__dirname, 'src/background/background.ts')
      },
      output: {
        entryFileNames: (chunk) => {
          return chunk.name === 'popup' ? 'assets/[name]-[hash].js' : '[name].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'content.css') {
            return 'content.css';
          }
          return 'assets/[name]-[hash].[ext]';
        }
      }
    },
    outDir: 'dist',
    assetsInlineLimit: 0
  }
}) 