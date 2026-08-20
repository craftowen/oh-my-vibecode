import { data } from "react-router";
import { safeRedirect } from "../lib/validation";
import { serializeTheme, type Theme } from "../lib/theme";
import type { Route } from "./+types/api.theme";

/** A resource route still needs to answer GET. Without this, React Router
 * returns its own 400 "Unexpected Server Error" to crawlers and to anyone who
 * pastes the URL. */
export function loader() {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST" },
  });
}

/** Persists the theme choice. Posted by <ThemeToggle> through a fetcher, so
 * the page never navigates; without JS the surrounding <Form> still works and
 * the browser follows the redirect back. */
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const theme = form.get("theme") === "dark" ? "dark" : ("light" satisfies Theme);

  // Never trust this value: it lands in a Location header. See safeRedirect.
  const redirectTo = safeRedirect(form.get("redirectTo"));

  const headers = new Headers({ "Set-Cookie": serializeTheme(theme) });

  // Progressive enhancement: a plain form post gets a redirect back to the page
  // it came from; the fetcher just ignores the 204/redirect body.
  if (request.headers.get("Sec-Fetch-Mode") === "navigate") {
    headers.set("Location", redirectTo);
    return new Response(null, { status: 302, headers });
  }
  return data({ theme }, { headers });
}
