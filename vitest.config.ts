import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "{simulator,ai,database,backend,evals}/src/**/*.test.ts",
      "tests/{integration,contracts}/**/*.test.ts",
    ],
    environment: "node",
    env: { NODE_ENV: "test" },
    coverage: {
      provider: "v8",
      include: ["{simulator,ai,database,backend}/src/**/*.ts"],
      exclude: ["**/*.test.ts", "backend/src/server.ts"],
    },
  },
});
