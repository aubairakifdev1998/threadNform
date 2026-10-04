import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "test-results/**",
    "playwright-report/**",
  ]),
  {
    rules: {
      // Widely used sync init-in-effect patterns (media queries, URL sync).
      // Keep as warnings until surfaces are migrated to external-store reads.
      "react-hooks/set-state-in-effect": "warn",
      "@typescript-eslint/no-unnecessary-type-constraint": "warn",
    },
  },
]);

export default eslintConfig;
