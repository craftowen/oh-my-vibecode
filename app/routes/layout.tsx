import { useEffect, useRef, useState } from "react";
import { Form, Link, NavLink, Outlet, useLocation, useLoaderData } from "react-router";
import { LayoutDashboard, LogOut, Menu, Settings, X } from "lucide-react";
import { authMiddleware, sessionContext } from "../lib/middleware";
import { getTheme } from "../lib/theme";
import { cn } from "../lib/cn";
import { Button } from "../components/ui/button";
import { ThemeToggle } from "../components/theme-toggle";
import type { Route } from "./+types/layout";

export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

export async function loader({ request, context }: Route.LoaderArgs) {
  // authMiddleware already resolved the session — reading it here is free.
  const session = context.get(sessionContext)!;
  return { user: session.user, theme: getTheme(request) ?? "light" };
}

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export default function AppLayout() {
  const { user, theme } = useLoaderData<typeof loader>();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  const drawerRef = useRef<HTMLElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Close on route change — otherwise tapping a link leaves the drawer open
  // over the page you just navigated to.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  /**
   * The drawer looks like a modal, so it has to behave like one: Escape closes
   * it, focus moves inside on open and returns to the trigger on close, and Tab
   * cycles within it instead of wandering into the page behind the scrim.
   */
  useEffect(() => {
    if (!mobileNavOpen) return;

    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileNavOpen(false);
        openButtonRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !drawerRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileNavOpen]);

  function closeDrawer() {
    setMobileNavOpen(false);
    openButtonRef.current?.focus();
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Sidebar — a modal drawer on mobile, a static column from lg up. */}
      <aside
        id="app-nav"
        ref={drawerRef}
        aria-label="Sidebar"
        {...(mobileNavOpen ? { role: "dialog", "aria-modal": true } : {})}
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 border-r bg-card transition-transform duration-200",
          "lg:static lg:z-auto lg:translate-x-0",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b px-4">
          <Link
            to="/dashboard"
            prefetch="intent"
            className="truncate font-semibold tracking-tight"
          >
            oh-my-vibecode
          </Link>
          <Button
            ref={closeButtonRef}
            variant="ghost"
            size="icon"
            className="shrink-0 lg:hidden"
            aria-label="Close navigation"
            onClick={closeDrawer}
          >
            <X aria-hidden />
          </Button>
        </div>

        <nav aria-label="Main" className="space-y-1 p-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              prefetch="intent"
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{label}</span>
                  {isActive && <span className="sr-only">(current page)</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Scrim. z-40 puts it above the sticky header (z-30) so the whole page —
          header included — is really inert while the drawer is open. */}
      {mobileNavOpen && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={closeDrawer}
        />
      )}

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b bg-background/80 px-3 backdrop-blur sm:px-4">
          <Button
            ref={openButtonRef}
            variant="ghost"
            size="icon"
            className="shrink-0 lg:hidden"
            aria-label="Open navigation"
            aria-expanded={mobileNavOpen}
            aria-controls="app-nav"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu aria-hidden />
          </Button>

          <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
            <span
              className="hidden min-w-0 max-w-[14rem] truncate text-sm text-muted-foreground sm:inline"
              title={user.email}
            >
              {user.email}
            </span>
            <ThemeToggle theme={theme} />
            <Form method="post" action="/logout">
              <Button variant="ghost" size="sm" type="submit">
                <LogOut aria-hidden />
                <span className="hidden sm:inline">Log out</span>
                <span className="sr-only sm:hidden">Log out</span>
              </Button>
            </Form>
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
