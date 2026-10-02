import { defineConfig } from 'vitest/config';

// HTTP-level tests against the compiled app (dist/) and a local Postgres.
// Run with: INTEGRATION_DATABASE_URL=postgres://... npm run test:integration
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/integration/**/*.int-spec.ts'],
    globalSetup: ['test/integration/global-setup.ts'],
    // Suites share one database and toggle global settings: run serially.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
