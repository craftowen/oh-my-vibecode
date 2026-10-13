# A per-user CRUD feature

Worked example of the recipe in AGENTS.md: a "notes" list that each user only
sees their own rows of.

## 1. Schema

```ts
// packages/db/src/schema.ts
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

export const note = sqliteTable("note", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
}, (t) => [
  // The list filters on userId and sorts on createdAt — one index covers both.
  index("note_userId_createdAt_idx").on(t.userId, t.createdAt),
]);
```

```bash
bun run db:generate && bun run db:migrate:local
```

Commit the generated file in `packages/db/drizzle/` — tests pick it up
automatically, and every app on the D1 sees the table through `@repo/db`.

## 2. Route

```tsx
// apps/web/app/routes/notes.tsx
import { Form, data, useFetcher, useNavigation } from "react-router";
import { drizzle } from "drizzle-orm/d1";
import { desc, eq, and } from "drizzle-orm";
import { note } from "@repo/db";
import { cloudflareContext } from "../lib/app-context";
import { cachedClientLoader } from "../lib/client-cache";
import { sessionContext } from "../lib/middleware";
import { field, type FormErrors } from "../lib/validation";
import { EmptyState } from "../components/empty-state";
import { Button } from "../components/ui/button";
import { Field } from "../components/field";
import type { Route } from "./+types/notes";

export async function loader({ context }: Route.LoaderArgs) {
  const session = context.get(sessionContext)!;      // free — middleware resolved it
  const { env } = context.get(cloudflareContext)!;
  const db = drizzle(env.DB);

  // Not awaited: the shell streams first, the list fills in.
  const notes = db
    .select()
    .from(note)
    .where(eq(note.userId, session.user.id))
    .orderBy(desc(note.createdAt))
    .then((rows) => rows);

  return { notes };
}

// Revisits render from the in-memory cache; any POST on the page clears it.
export const clientLoader = (args: Route.ClientLoaderArgs) => cachedClientLoader(args);

export async function action({ request, context }: Route.ActionArgs) {
  const session = context.get(sessionContext)!;
  const { env } = context.get(cloudflareContext)!;
  const db = drizzle(env.DB);
  const form = await request.formData();

  if (field(form, "intent") === "delete") {
    // Scope every mutation by userId — an id alone is not authorisation.
    await db
      .delete(note)
      .where(and(eq(note.id, field(form, "id")), eq(note.userId, session.user.id)));
    return { errors: {} as FormErrors };
  }

  const body = field(form, "body");
  if (!body) {
    const errors: FormErrors = { body: "Write something first." };
    return data({ errors }, { status: 400 });
  }

  await db.insert(note).values({
    id: crypto.randomUUID(),
    userId: session.user.id,
    body,
    createdAt: new Date(),
  });
  return { errors: {} as FormErrors };
}
```

Render the list inside `<Suspense>` with `use(notes)`, exactly like
`apps/web/app/routes/dashboard.tsx` does for its stats. Each row deletes
through its own fetcher and disappears on click, not after the round-trip:

```tsx
interface NoteRowProps {
  row: typeof note.$inferSelect;
}

function NoteRow({ row }: NoteRowProps) {
  const fetcher = useFetcher();
  // Optimistic: if the action fails, revalidation brings the row back.
  if (fetcher.formData?.get("intent") === "delete") return null;
  return (
    <li className="flex items-center justify-between">
      <span>{row.body}</span>
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="delete" />
        <input type="hidden" name="id" value={row.id} />
        <Button type="submit" variant="ghost" size="sm">Delete</Button>
      </fetcher.Form>
    </li>
  );
}
```

No cache invalidation code: the root's `invalidateOnMutation` empties the
client cache around every POST.

## 3. Register it

```ts
// apps/web/app/routes.ts — inside the protected layout
layout("routes/layout.tsx", [
  route("dashboard", "routes/dashboard.tsx"),
  route("notes", "routes/notes.tsx"),
  route("settings", "routes/settings.tsx"),
]),
```

Add it to the `NAV` array in `apps/web/app/routes/layout.tsx` to get a sidebar link.

## 4. Test the route, not the query

```ts
// apps/web/tests/notes.spec.ts
import { formPost, signUp } from "./helpers";

const cookie = await signUp("notes@example.com");

const created = await SELF.fetch(formPost("/notes", { body: "hello" }, cookie));
expect(created.status).toBe(200);

const page = await SELF.fetch(
  new Request("http://localhost/notes", { headers: { Cookie: cookie } }),
);
expect(await page.text()).toContain("hello");
```

And one test that matters more than the happy path — that another user cannot
see or delete these rows:

```ts
const otherCookie = await signUp("stranger@example.com");
const theirPage = await SELF.fetch(
  new Request("http://localhost/notes", { headers: { Cookie: otherCookie } }),
);
expect(await theirPage.text()).not.toContain("hello");
```

## 5. Gate

```bash
bun run check
```
