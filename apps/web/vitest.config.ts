import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  test: { setupFiles: ["./tests/setup-db.ts"] },
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
