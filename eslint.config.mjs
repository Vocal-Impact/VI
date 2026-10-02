import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Modular-monolith boundaries (docs/PROJECT_BLUEPRINT.md §3.1):
 * code outside a module may only import its public entry points —
 *   @/modules/<name>            (server API: index.ts)
 *   @/modules/<name>/domain     (pure, client-safe rules)
 *   @/modules/<name>/ui[/…]     (feature components)
 *   @/modules/<name>/client     (client-side API)
 * Files inside a module use relative imports for their own internals.
 */
const moduleInternals = {
  group: [
    "@/modules/*/application",
    "@/modules/*/application/*",
    "@/modules/*/infrastructure",
    "@/modules/*/infrastructure/*",
    "@/modules/*/schemas",
    "@/modules/*/domain/*",
  ],
  message: "Import a module through its public entry point (@/modules/<name>, /domain, /ui or /client).",
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "smart"],
      "no-restricted-imports": ["error", { patterns: [moduleInternals] }],
    },
  },
  {
    // The shared kernel must not depend on any feature module.
    files: ["src/shared/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@/modules/*"], message: "src/shared must not import feature modules." }] },
      ],
    },
  },
  {
    // Scripts, seeds and the logger may print.
    files: ["scripts/**", "prisma/**", "tests/**", "src/shared/lib/logger.ts"],
    rules: { "no-console": "off" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);
