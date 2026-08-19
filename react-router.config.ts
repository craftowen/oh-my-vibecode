import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  // NOTE: `prerender` is intentionally NOT used — it currently 500s when combined
  // with @cloudflare/vite-plugin's merged ssr environment. Edge SSR is fast enough
  // for the landing page; revisit when the plugin interaction is fixed upstream.
} satisfies Config;
