import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 개발 모드: Vite(5173) → API/에셋 요청은 Node 서버(5174)로 프록시
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5174',
      '/uploads': 'http://localhost:5174',
      '/exports': 'http://localhost:5174',
    },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
});
