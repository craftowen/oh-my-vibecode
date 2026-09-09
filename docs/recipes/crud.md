# A per-user CRUD feature

Worked example of the recipe in AGENTS.md: a "notes" list that each user only
sees their own rows of.

## 1. Schema

```ts
// app/db/schema.ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

export const note = sqliteTable("note", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
});
```

```bash
bun run db:generate && bun run db:migrate:local
```

Commit the generated file in `drizzle/` — tests pick it up automatically.

## 2. Route

```tsx
// app/routes/notes.tsx
import { Form, data, useNavigation } from "react-router";
import { drizzle } from "drizzle-orm/d1";
import { desc, eq, and } from "drizzle-orm";
import { cloudflareContext } from "../lib/app-context";
import { sessionContext } from "../lib/middleware";
import { note } from "../db/schema";
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
`app/routes/dashboard.tsx` does for its stats.

## 3. Register it

```ts
// app/routes.ts — inside the protected layout
layout("routes/layout.tsx", [
  route("dashboard", "routes/dashboard.tsx"),
  route("notes", "routes/notes.tsx"),
  route("settings", "routes/settings.tsx"),
]),
```

Add it to the `NAV` array in `app/routes/layout.tsx` to get a sidebar link.

## 4. Test the route, not the query

```ts
// tests/notes.spec.ts
const cookie = await signUp("notes@example.com");     // see tests/account.spec.ts

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
