# Recipes

Short, copy-paste guides for things this kit deliberately leaves out of the core.
Each one assumes the patterns in [AGENTS.md](../../AGENTS.md) — bindings from
`context.get(cloudflareContext)!`, routes registered in `app/routes.ts`, UI built
from `app/components/ui/*`.

| Recipe | What it covers |
|---|---|
| [email.md](./email.md) | Sending real email; swapping Resend for another provider |
| [oauth.md](./oauth.md) | Adding Google and other social providers |
| [crud.md](./crud.md) | A per-user CRUD feature end to end, with tests |
| [workers-ai.md](./workers-ai.md) | Calling Workers AI from a loader or action |
| [r2-uploads.md](./r2-uploads.md) | File uploads to R2 |
| [cron.md](./cron.md) | Scheduled work with Cron Triggers |
