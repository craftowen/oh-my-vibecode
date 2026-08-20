import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const rootDir = process.cwd();
const devVarsPath = path.join(rootDir, ".dev.vars");

// (a) Create .dev.vars
if (!fs.existsSync(devVarsPath)) {
  const secret = crypto.randomUUID();
  fs.writeFileSync(
    devVarsPath,
    [
      "# Required",
      `BETTER_AUTH_SECRET=${secret}`,
      "BETTER_AUTH_URL=http://localhost:5173",
      "",
      "# Optional — Google sign-in. Leave empty to hide the button.",
      "GOOGLE_CLIENT_ID=",
      "GOOGLE_CLIENT_SECRET=",
      "",
      "# Optional — transactional email (verification, password reset).",
      "# Leave RESEND_API_KEY empty and emails are printed to the Worker console.",
      "RESEND_API_KEY=",
      "EMAIL_FROM=onboarding@resend.dev",
      "",
    ].join("\n"),
  );
  console.log("Created .dev.vars with secrets.");
} else {
  console.log(".dev.vars already exists, skipping creation.");
}

// (b) Run drizzle-kit generate
console.log("Generating migrations...");
try {
  execSync("npx drizzle-kit generate", { stdio: "inherit" });
} catch (e) {
  console.error("Failed to generate migrations");
  process.exit(1);
}

// (c) Apply local migrations
console.log("Applying migrations locally...");
try {
  execSync("npx wrangler d1 migrations apply DB --local", { stdio: "inherit" });
} catch (e) {
  console.error("Failed to apply migrations");
  process.exit(1);
}

console.log("Setup complete! Run `bun dev`, open http://localhost:5173/signup — the demo account is pre-filled, so one click gets you to the dashboard.");
