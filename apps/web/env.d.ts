/// <reference types="vite/client" />

declare module "virtual:react-router/server-build" {
  import { ServerBuild } from "react-router";
  export const routes: ServerBuild["routes"];
  export const entry: ServerBuild["entry"];
  export const prerender: ServerBuild["prerender"];
}
