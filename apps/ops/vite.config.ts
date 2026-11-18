import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const api = process.env.NOAR_API_ORIGIN ?? 'http://127.0.0.1:8000';
const ws = process.env.NOAR_REVERB_ORIGIN ?? 'ws://127.0.0.1:8080';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Same-origin API + websockets: tablets/phones on the LAN only need port 5173.
    proxy: {
      '/api': { target: api, changeOrigin: true },
      '/storage': { target: api, changeOrigin: true },
      '/app': { target: ws, ws: true, changeOrigin: true },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': { target: api, changeOrigin: true },
      '/storage': { target: api, changeOrigin: true },
      '/app': { target: ws, ws: true, changeOrigin: true },
    },
  },
});
