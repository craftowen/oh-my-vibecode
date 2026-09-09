import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher, useLocation } from "react-router";
import { Button } from "./ui/button";
import type { Theme } from "../lib/theme";

/** Theme switch. Optimistic: the <html> class is swapped locally the moment
 * you click, while the cookie write goes out through a fetcher. */
export function ThemeToggle({ theme }: { theme: Theme | null }) {
  const fetcher = useFetcher();
  const location = useLocation();
  const [systemTheme, setSystemTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemTheme(preference.matches ? "dark" : "light");
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  // fetcher.formData gives us the pending value for free — no local state.
  const pending = fetcher.formData?.get("theme") as Theme | undefined;
  const current = pending ?? theme ?? systemTheme;
  const next: Theme = current === "dark" ? "light" : "dark";

  useEffect(() => {
    if (current !== null) {
      document.documentElement.classList.toggle("dark", current === "dark");
    }
  }, [current]);

  return (
    <fetcher.Form
      method="post"
      action="/api/theme"
      onSubmit={() => {
        document.documentElement.classList.toggle("dark", next === "dark");
      }}
    >
      <input type="hidden" name="theme" value={next} />
      <input
        type="hidden"
        name="redirectTo"
        value={location.pathname + location.search}
      />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        disabled={fetcher.state !== "idle"}
        aria-label={`Switch to ${next} theme`}
      >
        {current === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
      </Button>
    </fetcher.Form>
  );
}
