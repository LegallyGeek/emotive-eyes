import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte()],
  // Svelte must resolve its client build under jsdom.
  resolve: { conditions: ['browser'] },
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
