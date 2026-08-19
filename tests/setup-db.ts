import { applyD1Migrations } from "cloudflare:test";
import migration0000 from "../drizzle/0000_moaning_plazm.sql?raw";

export async function setupDb(env: any) {
  await applyD1Migrations(env.DB, [
    {
      name: "0000_moaning_plazm.sql",
      queries: migration0000.split("--> statement-breakpoint").map(q => q.trim()).filter(Boolean)
    }
  ]);
}
