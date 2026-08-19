import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  resolve: { tsconfigPaths: true },
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
