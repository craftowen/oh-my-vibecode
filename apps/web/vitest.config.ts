import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  test: { setupFiles: ["./tests/setup-db.ts"], maxWorkers: 2, testTimeout: 20_000 },
  plugins: [
    cloudflareTest({
      main: "./build/server/index.js",
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        d1Databases: ["DB"],
      },
    }),
  ],
});
