import { createContext } from "react-router";

export const cloudflareContext = createContext<{
  env: Env;
  ctx: ExecutionContext;
}>();

/** Per-request CSP nonce, generated in server.ts. Read it in the root loader so
 * <Scripts nonce> and any inline script can be allow-listed by the policy. */
export const nonceContext = createContext<string>();
