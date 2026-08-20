# Social sign-in

Google is pre-wired and appears on `/login` only when both variables are set —
so an unconfigured clone shows no dead button.

## Google

1. In Google Cloud Console create an OAuth 2.0 Client ID (type: Web
   application).
2. Authorized redirect URI: `http://localhost:5173/api/auth/callback/google`
   for local, and `https://your-app.workers.dev/api/auth/callback/google` for
   production.
3. Set the variables:

```bash
# .dev.vars
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
```

```bash
bunx wrangler secret put GOOGLE_CLIENT_ID
bunx wrangler secret put GOOGLE_CLIENT_SECRET
```

`BETTER_AUTH_URL` must match the origin the callback is registered under, or the
provider will reject the exchange.

## Adding another provider

`app/lib/auth.server.ts` builds `socialProviders` conditionally. Extend it the
same way:

```ts
socialProviders: {
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
    : {}),
  ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
    ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } }
    : {}),
}
```

Then add the button. Social sign-in is the one auth path that stays on the
client, because it is a browser redirect:

```tsx
<Button
  variant="outline"
  className="w-full"
  onClick={() => authClient.signIn.social({ provider: "github", callbackURL: "/dashboard" })}
>
  Continue with GitHub
</Button>
```

Surface the availability flag from the loader (`hasGithub`) the same way
`hasGoogle` is done, and run `bun run cf-typegen` after adding the variables.

## Account linking

Better Auth links a social login to an existing user when the verified email
matches. Providers that do not return a verified email create a separate
account — check your provider's scopes before assuming a merge.
