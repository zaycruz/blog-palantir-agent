import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globals: true,
    testTimeout: 30000,
    server: {
      deps: {
        inline: [],
        external: [/better-sqlite3/]
      }
    }
  }
});
