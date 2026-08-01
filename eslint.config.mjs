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
    "dist/**",
    "out/**",
    "build/**",
    // Project-local managed runtimes contain vendored UI bundles. They are
    // downloaded dependencies, not application source.
    ".spanplane-data/**",
    ".a2a-data/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
