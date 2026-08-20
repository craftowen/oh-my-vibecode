# Workers AI

Text generation, embeddings and image models, billed per request with no API key
to manage.

## 1. Add the binding

```jsonc
// wrangler.jsonc
{
  "ai": { "binding": "AI" }
}
```

```bash
bun run cf-typegen   # regenerate Env so env.AI is typed
```

## 2. Call it from an action

Bindings are per-request, exactly like D1:

```tsx
// app/routes/summarize.tsx
import { cloudflareContext } from "../lib/app-context";
import type { Route } from "./+types/summarize";

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext)!;
  const form = await request.formData();

  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      { role: "system", content: "Summarise the user's text in one sentence." },
      { role: "user", content: String(form.get("text") ?? "") },
    ],
  });

  return { summary: result.response };
}
```

## Streaming a response

Inference is slow enough that it should never block the shell. Either stream the
tokens straight to the client:

```ts
const stream = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
  messages,
  stream: true,
});
return new Response(stream, {
  headers: { "Content-Type": "text/event-stream" },
});
```

…or, in a loader, return the promise un-awaited and render it with `<Suspense>`
+ `use()` — the kit's default pattern, see `app/routes/dashboard.tsx`.

## Cost and limits

`env.AI.run` counts against Workers AI's neuron allowance. Put user-triggered
inference behind the rate limiter in `app/lib/rate-limit.server.ts` before
shipping it:

```ts
const limit = await limitAuthAttempt(env, request, "ai-summarize", {
  window: 60,
  max: 10,
});
if (limit.blocked) return data({ errors: { form: limit.message } }, { status: 429 });
```
