import { defineConfig } from "vitest/config";

// Pure-function tests only: no network, no model, no DOM. The route handler is
// exercised by the manual script in the spec, not here.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    passWithNoTests: true,
  },
});
