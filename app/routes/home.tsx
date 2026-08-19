import { Link } from "react-router";

export default function Index() {
  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="text-center">
        <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 mb-4">
          oh-my-vibecode
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl">
          The minimal, production-ready React Router 8 × Cloudflare Workers starter kit.
        </p>
        <div className="flex justify-center gap-4">
          <Link
            prefetch="intent"
            to="/login"
            className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
          >
            Get Started
          </Link>
          <a
            href="https://github.com/craftowen/oh-my-vibecode"
            className="px-6 py-3 bg-white text-gray-900 border border-gray-300 font-medium rounded-lg hover:bg-gray-50 transition"
          >
            GitHub
          </a>
        </div>
      </div>
    </div>
  );
}
