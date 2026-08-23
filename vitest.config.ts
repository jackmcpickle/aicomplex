import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      // lcov is what `aicc` reads for the crap metric; text keeps the summary
      // visible when you run it locally.
      reporter: ["text-summary", "lcov"],
      include: ["src/**/*.ts"],
    },
  },
});
