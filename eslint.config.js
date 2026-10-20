import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const llmImports = ["@archie/ai/llm", "@archie/ai/llm/*", "@anthropic-ai/sdk", "@google/genai", "groq-sdk"];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["frontend/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // docs/04: the browser must never import server-only LLM code or the backend.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: llmImports, message: "Server-only. The frontend must not import LLM code." },
            { group: ["@archie/backend"], message: "Only app/api/[[...route]]/route.ts may mount the backend." },
          ],
        },
      ],
    },
  },
  {
    files: ["frontend/src/app/api/**/route.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: llmImports, message: "Server-only LLM code belongs in the backend." }] },
      ],
    },
  },
  {
    // docs/04 + ADR-002: the simulator is pure. No other workspace packages, no React, no I/O.
    files: ["simulator/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@archie/*", "react", "react-dom", "node:*"], message: "simulator must stay pure." }] },
      ],
    },
  },
);
