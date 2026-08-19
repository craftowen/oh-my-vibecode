import { useRouteLoaderData } from "react-router";
import type { Route } from "./+types/_app.settings";
import { buildAuth } from "../lib/auth.server";

import { cloudflareContext } from "../lib/app-context";

export async function loader({ request, context }: Route.LoaderArgs) {
  const auth = buildAuth(context.get(cloudflareContext)!.env);
  const sessions = await auth.api.listSessions({ headers: request.headers });
  return { sessions };
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  const appData = useRouteLoaderData("routes/_app") as { user: any };
  const user = appData?.user;
  
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Settings</h2>
      
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-lg font-medium mb-4">Profile</h3>
        <p className="text-gray-600">Email: {user?.email}</p>
        <p className="text-gray-600">Name: {user?.name}</p>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-lg font-medium mb-4">Active Sessions</h3>
        <ul className="space-y-4">
          {loaderData.sessions.map((session: any) => (
            <li key={session.id} className="text-sm p-4 border rounded bg-gray-50">
              <p><strong>Device:</strong> {session.userAgent}</p>
              <p><strong>IP:</strong> {session.ipAddress}</p>
              <p><strong>Created:</strong> {new Date(session.createdAt).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
