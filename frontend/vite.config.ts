import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  preview: {
    allowedHosts: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        register: resolve(__dirname, 'register.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        chat: resolve(__dirname, 'chat.html'),
        credits: resolve(__dirname, 'credits.html'),
      },
    },
  },
});
