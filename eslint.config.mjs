import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ["worker.ts"],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".agents/**",
    ".claude/**",
    ".cursor/**",
    ".github/**",
    ".open-next/**",
    ".wrangler/**",
    "tooling/**",
  ]),
]);

export default eslintConfig;
