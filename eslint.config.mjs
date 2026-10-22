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
    // Nested git worktrees. `npm run lint` is bare `eslint`, so it lints the
    // whole cwd, and flat config only auto-ignores node_modules and .git —
    // without this it walks every checked-out branch under .worktrees/.
    ".worktrees/**",
  ]),
]);

export default eslintConfig;
