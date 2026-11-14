# Cloudflare usage and D1 query costs

Use this before shipping a repeated lookup, list, sync, poll or scheduled job.
The kit's local setup does not configure Cloudflare billing or alerts.

## Measure the work, including misses

D1 bills scanned rows, not returned rows or SQL statement counts. A lookup that
returns one row can scan the entire table. Streaming, parallel execution and
`db.batch()` improve latency without eliminating those reads.

For each repeated query:

1. Use its actual SQL, bound values, filters and sort order. Include background
   revalidation, retries and every query inside per-file/per-user loops.
2. Apply the generated migrations to the local test DB. Seed enough unrelated
   rows that a full scan exceeds the intended budget; tiny fixtures hide scans.
3. Inspect `EXPLAIN QUERY PLAN` and execute the query through D1's binding API.
   Check the result, `meta.rows_read` and `meta.rows_written` together.
4. Cover hits, misses, multiple matches, ordered tie-breakers, empty cleanup
   runs and a full batch. Keep row budgets in the feature's tests so CI catches
   an index that was declared but never migrated.

For example, in a Workers test after seeding sessions:

```ts
const sql = 'SELECT count(*) AS value FROM "session" WHERE "expiresAt" > ?';
const result = await env.DB.prepare(sql).bind(cutoffSeconds)
  .all<{ value: number }>();
expect(result.results).toEqual([{ value: 3 }]);
expect(result.meta.rows_read).toBeLessThanOrEqual(5);
expect(result.meta.rows_written).toBe(0);

const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
  .bind(cutoffSeconds).all<{ detail: string }>();
expect(plan.results.some((r) => r.detail.includes("session_expiresAt_idx"))).toBe(true);
```

[The kit's regression tests](../../apps/web/tests/d1-cost.spec.ts) use 515-row
fixtures, verify bounded reads and include a negative control: removing either
range index exposes hundreds of scanned rows. They run as part of `bun run check`.
Full-batch cases also seed 503 stale counters and execute 500-row cleanup through
Drizzle-generated SQL, checking reads, writes and remaining rows.
Local results establish query behavior, not an exact production bill.

## Choose an index for the access direction

- A `path` primary key does not index `WHERE folderId = ?`. Reverse lookups need
  their own index; `(folderId, path)` can cover the returned path too.
- Match equality columns, range conditions and ordering to composite indexes.
  `ORDER BY startedAt DESC, receivedAt DESC LIMIT 1` needs both ordering columns
  to avoid sorting many tied timestamps.
- An index on a join/filter column does not make a function around that column
  (`substr`, `replace`, casts) indexable automatically. Inspect the actual plan.
- `LIMIT` bounds returned rows, not necessarily scanned rows. Verify both.
- Do not reject every `SCAN`: an ordered index scan with LIMIT can be bounded.
  Conversely, an indexed COUNT still reads every matching entry. Full-table
  aggregates need an explicit row/frequency budget or a maintained summary.
- Indexes also add storage and writes. Add ones used by actual queries and test
  their benefit; do not index every column preemptively.

The core includes `session.expiresAt` for the dashboard/cleanup,
`account(issuer, accountId)` for OAuth account lookups, `verification.expiresAt`
for verification cleanup, and `rateLimit.lastRequest` for stale-counter cleanup.
Keep authentication columns and timestamp modes unchanged: auth dates use
seconds; rate-limit `lastRequest` uses milliseconds.

Generate indexes from Drizzle schema, apply migrations locally, then apply them
to the intended production DB before deploying dependent code. Read back the
production indexes and verify representative metadata. Never point a benchmark
at production by default or execute cleanup there as a read-only check.

## Bound repeated work

Use a cursor and a maximum batch size for sync/cleanup. Share duplicate lookups
within one run (including concurrent requests for the same key), skip unchanged
writes and avoid rescanning history when no new data arrived. Do not introduce
shared per-user caches without correct authorization and freshness boundaries.

The cleanup examples in [cron.md](./cron.md) and [new-app.md](./new-app.md) delete
at most 500 rows per invocation. Indexes narrow candidate lookup; deleting 500
matches still costs writes for rows and affected indexes. Large backlogs need a
progress/retry plan rather than unbounded work in one scheduled invocation.

## Estimate a month, not just one request

```text
monthly reads  = sum(rows_read per call × calls per run × runs per month)
monthly writes = sum(rows_written per call × calls per run × runs per month)
```

Include peak imports, failed retries, polling, visible-tab refreshes, scheduled
work and all Workers/databases sharing the account's included allowance. A
minute-by-minute job runs 44,640 times in a 31-day period. A ten-minute quiet
sample is a provisional extrapolation; repeat across ordinary busy work and
large batches before treating it as a monthly forecast.

Check current [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
and [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).
At the 2026-10-29 check, Workers Paid includes 25 billion D1 reads and 50 million
writes per billing month; excess costs $0.001 per million reads and $1 per
million writes. Verify current account plan and renewal dates rather than using
calendar months. Sum account usage before subtracting included allowances once.
Keep fixed subscriptions, storage, AI/other products and tax separate.

## Configure and verify budget alerts at deployment

In the intended account, go to **Billing → Billable Usage → Create budget alert**.
This dashboard is for Pay-as-you-go accounts; Enterprise contracts require
their account-specific billing and notification process.
Start with an account-wide **US$5 usage alert** to the project owner unless the
owner specifies otherwise. Verify account id, threshold, recipient and the saved
alert by reopening it. Record the verification; do not write “configured” based
on a local config file. Use the new project's values, never copied credentials,
account ids or recipient addresses from another project.

An alert is a notification, not a spending cap. Its threshold concerns usage
overages, not fixed plan fees. See [official budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/).
The kit never creates paid services or billing notifications during local setup.

When reporting cost, distinguish the billable-usage dashboard's cumulative cost
and historical-average projection, a forecast based on post-fix measurements,
and an issued invoice. Recent metrics may not yet be reflected in billing.
Already accrued charges are not erased by a fix. Usage can be charged mid-cycle
under [threshold billing](https://developers.cloudflare.com/billing/threshold-billing/),
so a regular renewal date is not a guarantee of no earlier automatic payment.
