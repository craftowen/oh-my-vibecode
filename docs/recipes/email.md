# Sending email

The kit ships a single entry point — `sendEmail(env, message)` in
`apps/web/app/lib/email.server.ts`. Better Auth's verification and password-reset hooks
already call it, so wiring a provider is the only thing left to do.

## Local development

`bun dev` and the tests run with the `EMAIL` binding declared in
`apps/web/wrangler.jsonc`, and Miniflare simulates it: nothing is delivered, and
the console prints `send_email binding called with MessageBuilder:`, the headers,
and the paths of a text and an HTML file holding the body. Open the text file,
copy the verification or reset link and paste it into the browser — that is
enough to walk the whole flow locally.

Where the binding is absent (a deployment whose `wrangler.jsonc` has no
`send_email` entry — this repo's production config, until Email Routing is
verified), `sendEmail` logs the message, link included, to the Worker console
instead of sending it.

## Using Cloudflare Workers Send Email

The kit is preconfigured to use Cloudflare Workers Send Email via the `send_email`
binding in `apps/web/wrangler.jsonc`:

```jsonc
// apps/web/wrangler.jsonc
"send_email": [
  {
    "name": "EMAIL"
  }
]
```

1. Enable Email Routing in your Cloudflare dashboard for your domain. CI
   deploys with the `CLOUDFLARE_WRANGLER_CONFIG` secret instead of the
   committed file, so add the same `send_email` entry to that secret too.
2. Set `EMAIL_FROM` to an address on your verified Cloudflare domain:

```bash
# apps/web/.dev.vars (local) — for production use wrangler secret put
EMAIL_FROM=noreply@your-verified-domain.com
```

```bash
bunx wrangler secret put EMAIL_FROM --config apps/web/wrangler.jsonc
```

After changing bindings or variables, regenerate the `Env` type:

```bash
bun run cf-typegen
```

## Using another provider

Replace the body of `sendEmail()`. Every caller goes through it, so nothing else
changes:

```ts
// apps/web/app/lib/email.server.ts
export async function sendEmail(env: Env, message: EmailMessage): Promise<void> {
  try {
    const response = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "X-Postmark-Server-Token": env.POSTMARK_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        From: env.EMAIL_FROM,
        To: message.to,
        Subject: message.subject,
        TextBody: message.text,
        HtmlBody: message.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) console.error(`[email] failed (${response.status})`);
    await response.body?.cancel();
  } catch (error) {
    console.error("[email] failed:", error);
  }
}
```

Two rules worth keeping:

1. **Never throw out of `sendEmail`.** A provider outage must not turn a
   successful signup into an error page — log it and let the user request a
   resend from Settings.
2. **Keep delivery attached to the request lifecycle.** Await it as the current
   hooks do. To send after the response, pass the promise to the current request's
   `ctx.waitUntil()`; a bare `void sendEmail(...)` can be interrupted when the
   Worker finishes the response. See [Cloudflare's context documentation](https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil).

## Requiring verified email

Off by default so `bun run setup && bun dev` gives you a usable account with no
third-party signup. Once email works:

```ts
// apps/web/app/lib/auth.server.ts
emailAndPassword: {
  enabled: true,
  requireEmailVerification: true,  // <- was false
  ...
}
```

Users then cannot sign in until they click the link. Settings already shows a
Verified / Unverified badge and a resend button.
