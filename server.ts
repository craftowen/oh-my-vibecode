import { createRequestHandler, RouterContextProvider } from "react-router";
import * as build from "virtual:react-router/server-build";
import { cloudflareContext, nonceContext } from "./app/lib/app-context";

const requestHandler = createRequestHandler(build as any, import.meta.env.MODE);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // One nonce per request, handed to the root loader so <Scripts nonce> and
    // the inline theme script can be allow-listed by the CSP below.
    const nonce = crypto.randomUUID().replaceAll("-", "");

    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    context.set(nonceContext, nonce);

    const response = await requestHandler(request, context);
    return withSecurityHeaders(request, response, nonce);
  },
};

/**
 * Baseline security headers. The CSP is only applied to HTML responses in
 * production builds — Vite's dev server injects its own inline scripts, which
 * no nonce of ours would cover.
 */
function withSecurityHeaders(
  request: Request,
  response: Response,
  nonce: string,
): Response {
  const headers = new Headers(response.headers);

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  );

  if (new URL(request.url).protocol === "https:") {
    headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }

  const isHtml = headers.get("Content-Type")?.includes("text/html");
  if (isHtml && import.meta.env.PROD) {
    headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        // 'strict-dynamic' lets the nonced entry script load the hashed module
        // chunks React Router emits, without listing every filename.
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "object-src 'none'",
      ].join("; "),
    );
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
