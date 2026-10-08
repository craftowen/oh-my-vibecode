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
      "# Uses Cloudflare Workers Send Email (send_email binding in wrangler.jsonc).",
      "# Set EMAIL_FROM to an address on your verified Cloudflare Email Routing domain.",
      "EMAIL_FROM=noreply@your-domain.com",
      "",
    ].join("\n"),
  );
  console.log("Created .dev.vars with secrets.");
} else {
  console.log(".dev.vars already exists, skipping creation.");
}

// (b) Apply the committed migrations. Generating them is `bun run db:generate`,
// run by whoever edits the schema, so setup never invents a migration nobody
// committed.
console.log("Applying migrations locally...");
try {
  execSync("bunx wrangler d1 migrations apply DB --local", { stdio: "inherit" });
} catch (e) {
  console.error("Failed to apply migrations");
  process.exit(1);
}

console.log("Setup complete! Run `bun dev`, open http://localhost:5173/signup — the demo account is pre-filled, so one click gets you to the dashboard.");
