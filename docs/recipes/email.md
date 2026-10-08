# Sending email

The kit ships a single entry point — `sendEmail(env, message)` in
`apps/web/app/lib/email.server.ts`. Better Auth's verification and password-reset hooks
already call it, so wiring a provider is the only thing left to do.

## Local development

When the `EMAIL` binding is not present or in local testing, the message
(including the verification or reset link) is printed to the Worker console.
That is enough to walk the whole flow locally — copy the link out of `bun dev`'s
output and paste it into the browser.

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

1. Enable Email Routing in your Cloudflare dashboard for your domain.
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
