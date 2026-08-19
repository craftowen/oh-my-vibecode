import { Link, redirect, useLoaderData } from "react-router";
import { buildAuth } from "../lib/auth.server";
import { useState } from "react";
import type { Route } from "./+types/signup";
import { authClient } from "../lib/auth.client";

import { cloudflareContext } from "../lib/app-context";

export async function loader({ request, context }: Route.LoaderArgs) {
  const auth = buildAuth(context.get(cloudflareContext)!.env);
  const session = await auth.api.getSession({ headers: request.headers });
  if (session) {
    throw redirect("/dashboard");
  }
  return null;
}

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { data, error } = await authClient.signUp.email({
      email,
      password,
      name,
    });
    if (error) {
      setError(error.message || "Failed to sign up");
    } else {
      window.location.href = "/dashboard";
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-6 text-center">Sign up</h2>
        {error && <div className="bg-red-50 text-red-600 p-3 mb-4 rounded text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="mt-1 block w-full p-2 border rounded-md"
              required
            />
          </div>
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
          <button type="submit" className="w-full bg-green-600 text-white p-2 rounded-md hover:bg-green-700">
            Sign up
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600">
          Already have an account? <Link to="/login" className="text-blue-600 hover:underline">Log in</Link>
        </div>
      </div>
    </div>
  );
}
