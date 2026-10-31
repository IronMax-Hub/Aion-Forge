// Vitest settings for the scientific probes (probes.ts): kept out of `npm test`,
// which they would slow by minutes and which they do not test.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL("..", import.meta.url)),
  test: {
    include: ["stats/probes.ts"],
    environment: "node",
    testTimeout: 3_600_000,
  },
});
