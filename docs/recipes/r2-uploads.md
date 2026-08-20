# File uploads to R2

R2 is S3-compatible object storage with no egress fees. It is the right place
for user uploads — D1 is not.

## 1. Bucket and binding

```bash
bunx wrangler r2 bucket create my-app-uploads
```

```jsonc
// wrangler.jsonc
{
  "r2_buckets": [
    { "binding": "UPLOADS", "bucket_name": "my-app-uploads" }
  ]
}
```

```bash
bun run cf-typegen
```

## 2. Accept the upload in an action

React Router parses `multipart/form-data` for you; the file arrives as a `File`.

```tsx
// app/routes/upload.tsx
import { data } from "react-router";
import { cloudflareContext } from "../lib/app-context";
import { sessionContext } from "../lib/middleware";
import type { FormErrors } from "../lib/validation";
import type { Route } from "./+types/upload";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

export async function action({ request, context }: Route.ActionArgs) {
  const session = context.get(sessionContext)!;
  const { env } = context.get(cloudflareContext)!;

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File) || file.size === 0) {
    const errors: FormErrors = { file: "Choose a file." };
    return data({ errors }, { status: 400 });
  }
  // Validate on the server. `accept` on the input is a hint, not a control.
  if (file.size > MAX_BYTES) {
    const errors: FormErrors = { file: "Files must be 5 MB or smaller." };
    return data({ errors }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    const errors: FormErrors = { file: "PNG, JPEG or WebP only." };
    return data({ errors }, { status: 400 });
  }

  // Namespace by user so one account can never overwrite another's object.
  const key = `${session.user.id}/${crypto.randomUUID()}`;
  await env.UPLOADS.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  // Store the key in D1; the bytes stay in R2.
  return { errors: {} as FormErrors, key };
}
```

The form must declare the encoding:

```tsx
<Form method="post" encType="multipart/form-data">
  <input type="file" name="file" accept="image/png,image/jpeg,image/webp" />
  <Button type="submit">Upload</Button>
</Form>
```

## 3. Serve it back

Do not make the bucket public if the objects are per-user. Stream them through a
route that checks the session first:

```tsx
// app/routes/uploads.$key.tsx  → route("uploads/*", "routes/uploads.$key.tsx")
export async function loader({ params, context }: Route.LoaderArgs) {
  const session = context.get(sessionContext)!;
  const { env } = context.get(cloudflareContext)!;

  const key = params["*"]!;
  if (!key.startsWith(`${session.user.id}/`)) throw new Response(null, { status: 404 });

  const object = await env.UPLOADS.get(key);
  if (!object) throw new Response(null, { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
```

For large files or public assets, prefer a presigned URL or a public bucket
binding so the bytes never pass through your Worker.

## Local development

`wrangler dev` emulates R2 on disk under `.wrangler/state` — no bucket needed to
develop, and it is gitignored.
