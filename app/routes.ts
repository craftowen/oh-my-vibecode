import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"),
  route("api/auth/*", "routes/api.auth.$.tsx"),
  layout("routes/_app.tsx", [
    route("dashboard", "routes/_app.dashboard.tsx"),
    route("settings", "routes/_app.settings.tsx"),
  ]),
] satisfies RouteConfig;
