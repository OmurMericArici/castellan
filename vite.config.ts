import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative base so the build works on GitHub Pages under any repo name.
  base: "./",
  test: {
    include: ["src/**/*.test.ts"],
  },
});
