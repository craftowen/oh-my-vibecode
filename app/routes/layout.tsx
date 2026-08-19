import { Outlet, redirect, Form, useLoaderData } from "react-router";
import { authMiddleware, sessionContext } from "../lib/middleware";
import type { Route } from "./+types/layout";

export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

export async function loader({ context }: Route.LoaderArgs) {
  const session = context.get(sessionContext)!;
  return { user: session.user };
}

export default function AppLayout() {
  const { user } = useLoaderData<typeof loader>();
  
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm border-b p-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">oh-my-vibecode</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{user.email}</span>
          <Form method="post" action="/api/auth/signout">
            <button type="submit" className="text-sm text-red-600 hover:text-red-800">
              Logout
            </button>
          </Form>
        </div>
      </header>
      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
