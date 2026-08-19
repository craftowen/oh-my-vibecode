import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    cloudflare({
      viteEnvironment: {
        name: "ssr"
      }
    }),
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
  ],
});
