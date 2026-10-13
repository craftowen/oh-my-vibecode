# Recipes

Short, copy-paste guides for things this kit deliberately leaves out of the core.
Each one assumes the patterns in [AGENTS.md](../../AGENTS.md) — bindings from
`context.get(cloudflareContext)!`, routes registered in `apps/web/app/routes.ts`,
UI built from `apps/web/app/components/ui/*`, tables in `packages/db` imported as
`@repo/db`. Commands run from the repo root.

A recipe that adds a binding or trigger to `apps/web/wrangler.jsonc` (AI, R2,
crons, queues, `send_email`) also needs it in the `CLOUDFLARE_WRANGLER_CONFIG`
secret: CI deploys with that secret in place of the committed file, so a binding
only in the file is missing in production and `env.<NAME>` is `undefined`.

| Recipe | What it covers |
|---|---|
| [email.md](./email.md) | Sending real email; swapping Cloudflare Send Email for another provider |
| [oauth.md](./oauth.md) | Adding Google and other social providers |
| [crud.md](./crud.md) | A per-user CRUD feature end to end, with tests |
| [workers-ai.md](./workers-ai.md) | Calling Workers AI from a loader or action |
| [r2-uploads.md](./r2-uploads.md) | File uploads to R2 |
| [cron.md](./cron.md) | Scheduled work with Cron Triggers |
| [new-app.md](./new-app.md) | A second Worker on the same D1: `apps/admin` behind Cloudflare Access, `apps/jobs` for cron and queues, CI |
