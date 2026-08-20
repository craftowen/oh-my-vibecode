import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),

  // Signed-out
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"),
  route("forgot-password", "routes/forgot-password.tsx"),
  route("reset-password", "routes/reset-password.tsx"),
  route("verify-email", "routes/verify-email.tsx"),
  route("logout", "routes/logout.tsx"),

  // Resource routes
  route("api/theme", "routes/api.theme.tsx"),
  route("api/auth/*", "routes/api.auth.tsx"),

  // Signed-in — authMiddleware guards everything in here
  layout("routes/layout.tsx", [
    route("dashboard", "routes/dashboard.tsx"),
    route("settings", "routes/settings.tsx"),
  ]),
] satisfies RouteConfig;
