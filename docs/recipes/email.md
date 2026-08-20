# Sending email

The kit ships a single entry point — `sendEmail(env, message)` in
`app/lib/email.server.ts`. Better Auth's verification and password-reset hooks
already call it, so wiring a provider is the only thing left to do.

## Local development

With `RESEND_API_KEY` empty, nothing is sent: the message (including the
verification or reset link) is printed to the Worker console. That is enough to
walk the whole flow locally — copy the link out of `bun dev`'s output and paste
it into the browser.

## Using Resend

```bash
# .dev.vars (local) — for production use wrangler secret put
RESEND_API_KEY=re_xxxxxxxx
EMAIL_FROM=you@your-verified-domain.com
```

```bash
bunx wrangler secret put RESEND_API_KEY
bunx wrangler secret put EMAIL_FROM
```

`EMAIL_FROM` must be an address on a domain you verified with the provider.

After adding any new variable, regenerate the `Env` type:

```bash
bun run cf-typegen
```

## Using another provider

Replace the body of `sendEmail()`. Every caller goes through it, so nothing else
changes:

```ts
// app/lib/email.server.ts
export async function sendEmail(env: Env, message: EmailMessage): Promise<void> {
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
  });
  if (!response.ok) console.error("[email] failed:", await response.text());
}
```

Two rules worth keeping:

1. **Never throw out of `sendEmail`.** A provider outage must not turn a
   successful signup into an error page — log it and let the user request a
   resend from Settings.
2. **Don't `await` it inside auth hooks if latency matters.** Better Auth's docs
   suggest `void sendEmail(...)` so response time does not leak whether an
   address exists.

## Requiring verified email

Off by default so `bun run setup && bun dev` gives you a usable account with no
third-party signup. Once email works:

```ts
// app/lib/auth.server.ts
emailAndPassword: {
  enabled: true,
  requireEmailVerification: true,  // <- was false
  ...
}
```

Users then cannot sign in until they click the link. Settings already shows a
Verified / Unverified badge and a resend button.
