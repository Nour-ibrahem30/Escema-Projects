/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // AI Proxy (local server on port 3001)
      '/api/ai-proxy': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Groq
      '/proxy/groq': {
        target: 'https://api.groq.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/groq/, ''),
      },
      // OpenAI
      '/proxy/openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/openai/, ''),
      },
      // OpenRouter
      '/proxy/openrouter': {
        target: 'https://openrouter.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/openrouter/, ''),
      },
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
  },
});
