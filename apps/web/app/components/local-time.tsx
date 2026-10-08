import { useEffect, useState } from "react";

/**
 * A timestamp that does not break hydration.
 *
 * `toLocaleString()` resolves BOTH the locale and the time zone from whatever
 * runtime calls it. On the server that is the Worker (UTC, and whatever ICU
 * locale the runtime defaults to); in the browser it is the visitor's machine.
 * Rendering it directly makes the server HTML and the client's first render
 * disagree, and React responds by throwing away the whole tree and re-rendering
 * it — which quietly costs you the SSR you just paid for.
 *
 * So: render a fixed, deterministic UTC string first (identical on both sides),
 * then swap in the visitor's local formatting after mount.
 */
/**
 * Formatted by hand, from the ISO string, on purpose.
 *
 * `Intl.DateTimeFormat` is NOT safe here even with the time zone pinned: the
 * Workers runtime and the browser ship different ICU versions, so `dateStyle:
 * "medium"` renders "Aug 20, 2026, 7:15 AM" in one and "Aug 20, 2026 at 7:15 AM"
 * in the other — a hydration mismatch all over again. Slicing the ISO string
 * gives a byte-identical result in every runtime.
 */
function formatUtc(iso: string): string {
  const [date, time] = iso.split("T");
  return `${date} ${time.slice(0, 5)} UTC`;
}

export function LocalTime({ value }: { value: Date | string | number }) {
  const iso = new Date(value).toISOString();

  // The initial state must match what the server rendered, so hydration is a
  // no-op; the effect below is what localises it.
  const [text, setText] = useState(() => formatUtc(iso));

  useEffect(() => {
    setText(new Date(iso).toLocaleString());
  }, [iso]);

  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  );
}
