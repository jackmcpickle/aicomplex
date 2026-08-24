import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      // lcov is what `aic3` reads for the crap metric; text keeps the summary
      // visible when you run it locally.
      reporter: ["text-summary", "lcov"],
      include: ["src/**/*.ts"],
    },
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
