import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/', // fondamentale per assets

  plugins: [react()],

  // SOLO per sviluppo locale
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000', // backend locale
        changeOrigin: true,
        secure: false,
      },
    },
  },
});