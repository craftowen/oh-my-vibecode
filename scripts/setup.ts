import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const rootDir = process.cwd();
const devVarsPath = path.join(rootDir, ".dev.vars");

// (a) Create .dev.vars
if (!fs.existsSync(devVarsPath)) {
  const secret = crypto.randomUUID();
  fs.writeFileSync(devVarsPath, `BETTER_AUTH_SECRET=${secret}\nBETTER_AUTH_URL=http://localhost:5173\n`);
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

console.log("Setup complete! Use demo@example.com / password1234 on the signup page to create an account, or log in if already created.");
