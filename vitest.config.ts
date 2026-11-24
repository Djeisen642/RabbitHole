import { defineConfig } from 'vitest/config';

// Unit tests cover pure logic in src/shared and src/server/core. Kept separate
// from vite.config.ts so tests don't load the Devvit build plugin.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
