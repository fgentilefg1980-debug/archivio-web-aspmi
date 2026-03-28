import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://archivio-aspmi-env.eba-kjnm4jnx.eu-north-1.elasticbeanstalk.com', // URL del backend in produzione
        changeOrigin: true,
        secure: true, // Imposta su `true` se usi HTTPS
      },
    },
  },
});