import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  const serverTarget = env.VITE_API_URL
    ? new URL(env.VITE_API_URL).origin
    : 'http://localhost:3001';

  return {
    plugins: [react()],
    envDir: '..',
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: serverTarget,
          changeOrigin: true,
        },
        '/exports': {
          target: serverTarget,
          changeOrigin: true,
        },
      },
    },
  };
})

