import { useOutletContext, Link } from "react-router";
import type { Route } from "./+types/_app.dashboard";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Dashboard" },
  ];
}

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <p className="text-gray-600 mb-4">Welcome back! You have successfully logged in.</p>
        <Link to="/settings" className="text-blue-600 hover:underline">
          Go to Settings &rarr;
        </Link>
      </div>
    </div>
  );
}
