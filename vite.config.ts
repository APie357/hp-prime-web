/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

export default defineConfig({
  // Served from https://apie357.github.io/hp-prime-web/ in production.
  base: process.env.NODE_ENV === 'production' ? '/hp-prime-web/' : '/',
  plugins: [svelte()],
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
