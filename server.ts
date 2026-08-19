import { createRequestHandler, RouterContextProvider } from "react-router";
import * as build from "virtual:react-router/server-build";
import { cloudflareContext } from "./app/lib/app-context";

const requestHandler = createRequestHandler(build as any, import.meta.env.MODE);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    return requestHandler(request, context);
  },
};
