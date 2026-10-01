import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Vite leaves the SSR build unminified and wrangler deploys it with
  // no_bundle, so without this the Worker ships ~1.9 MB of source that every
  // cold start has to parse.
  environments: { ssr: { build: { minify: true } } },
  plugins: [
    cloudflare({
      viteEnvironment: {
        name: "ssr"
      }
    }),
    tailwindcss(),
    reactRouter(),
  ],
});
