import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    cloudflareTest({
      main: "./build/server/index.js",
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        d1Databases: ["DB"],
      },
    }),
  ],
});
