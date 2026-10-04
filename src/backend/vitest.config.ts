import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      // Pure domain modules with unit suites. Application use-cases are gated
      // by the integration suite rather than line coverage here.
      include: [
        'src/domain/auth/**/*.ts',
        'src/domain/orders/**/*.ts',
        'src/domain/payments/**/*.ts',
        'src/domain/carts/**/*.ts',
        'src/domain/shared/**/*.ts',
      ],
      exclude: [
        '**/*.spec.ts',
        '**/*.edge.spec.ts',
        '**/index.ts',
        '**/*.d.ts',
        // Thin response helpers — exercised by integration/e2e, not unit suites.
        '**/api-response.ts',
        '**/pagination.ts',
        '**/commerce-field-map.ts',
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        statements: 60,
        branches: 50,
      },
    },
  },
});
