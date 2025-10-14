import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    historyApiFallback: true,
    host: true, // or '0.0.0.0'
    port: 5173
  },
   build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      }
    }
  }
});