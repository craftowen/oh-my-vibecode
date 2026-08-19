/// <reference types="@react-router/node" />
/// <reference types="vite/client" />

declare module "react-router" {
  interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

export {};

declare module "virtual:react-router/server-build" {
  import { ServerBuild } from "react-router";
  export const routes: ServerBuild["routes"];
  export const entry: ServerBuild["entry"];
  export const prerender: ServerBuild["prerender"];
}
