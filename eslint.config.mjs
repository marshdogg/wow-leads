import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Zero `any` in committed code — this is the guard, not a convention.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      // Per-agent dist dirs from the parallel build (see next.config.ts).
      ".next-*/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "design-refs/**",
      "db/migrations/**",
      "playwright-report/**",
      "test-results/**",
      "screenshots/**",
    ],
  },
];

export default eslintConfig;
