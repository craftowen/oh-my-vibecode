import { Form, Link, redirect, useLoaderData } from "react-router";
import { buildAuth } from "../lib/auth.server";
import { useState } from "react";
import type { Route } from "./+types/login";
import { authClient } from "../lib/auth.client";

import { cloudflareContext } from "../lib/app-context";

export async function loader({ request, context }: Route.LoaderArgs) {
  const auth = buildAuth(context.get(cloudflareContext)!.env);
  const session = await auth.api.getSession({ headers: request.headers });
  if (session) {
    throw redirect("/dashboard");
  }
  return {
    hasGoogle: !!(context.get(cloudflareContext)!.env.GOOGLE_CLIENT_ID && context.get(cloudflareContext)!.env.GOOGLE_CLIENT_SECRET)
  };
}

export default function Login() {
  const { hasGoogle } = useLoaderData<typeof loader>();
  const [email, setEmail] = useState("demo@example.com");
  const [password, setPassword] = useState("password1234");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { data, error } = await authClient.signIn.email({
      email,
      password,
    });
    if (error) {
      setError(error.message || "Failed to login");
    } else {
      window.location.href = "/dashboard";
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-6 text-center">Login</h2>
        <div className="bg-blue-50 text-blue-800 p-3 mb-6 rounded text-sm">
          Demo Account: demo@example.com / password1234
        </div>
        {error && <div className="bg-red-50 text-red-600 p-3 mb-4 rounded text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="mt-1 block w-full p-2 border rounded-md"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="mt-1 block w-full p-2 border rounded-md"
              required
            />
          </div>
          <button type="submit" className="w-full bg-blue-600 text-white p-2 rounded-md hover:bg-blue-700">
            Sign in
          </button>
        </form>

        {hasGoogle && (
          <div className="mt-4 pt-4 border-t">
            <button
              onClick={() => authClient.signIn.social({ provider: "google" })}
              className="w-full bg-white text-gray-700 border border-gray-300 p-2 rounded-md hover:bg-gray-50"
            >
              Sign in with Google
            </button>
          </div>
        )}

        <div className="mt-6 text-center text-sm text-gray-600">
          Don't have an account? <Link to="/signup" className="text-blue-600 hover:underline">Sign up</Link>
        </div>
      </div>
    </div>
  );
}
