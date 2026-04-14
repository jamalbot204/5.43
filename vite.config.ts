
import { fileURLToPath, URL } from 'url';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import react from '@vitejs/plugin-react-swc';
import { pwaOptions } from './pwa.options';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      plugins: [react(), VitePWA(pwaOptions)],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': fileURLToPath(new URL('.', import.meta.url)),
        }
      },
      // FORCE PRE-BUNDLING: Critical for Cloud Environments (AI Studio/IDX)
      // This forces Vite to process these heavy libraries immediately when the server starts,
      // preventing the "pause" or "reload" that happens when you first open a feature using them.
      optimizeDeps: {
        include: [
          'react', 
          'react-dom', 
          'react-markdown', 
          'rehype-raw', 
          'remark-gfm', 
          'mermaid', 
          'tone',
          'react-syntax-highlighter',
          'zustand',
          '@google/genai',
          'jszip',
          'html2canvas',
          'jspdf'
        ]
      },
      build: {
        target: 'esnext',
        sourcemap: false,
        minify: 'esbuild',
        rollupOptions: {
          onwarn(warning, warn) {
            if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client')) {
              return;
            }
            warn(warning);
          },
          output: {
            // manualChunks removed to prevent Rollup hang
          }
        }
      },
      esbuild: {
        pure: ['console.log', 'console.info', 'console.debug'],
        drop: ['debugger']
      }
    };
});
