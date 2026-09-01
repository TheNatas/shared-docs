/**
 * Pure formatting helpers. No React, no DOM, no I/O — see `specs/04-ui-spec.md` §1.
 */

/**
 * Cascading thresholds for `Intl.RelativeTimeFormat`: each `amount` is how many of
 * the current unit fit in the next one up, so dividing by it walks seconds → years.
 */
const DIVISIONS = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
] as const satisfies readonly { amount: number; unit: Intl.RelativeTimeFormatUnit }[];

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/**
 * `"2 hours ago"`, `"yesterday"`, `"now"` — the tail of the dashboard's `Edited …` line.
 *
 * **Call this on the server only, for server-rendered list views.** The result depends on
 * the wall clock, so a Client Component that computed it during render would produce a
 * different string on the client than the one in the server HTML and React would report a
 * hydration mismatch — and then silently keep the stale server text. Calling it from a
 * client component is the obvious-looking "improvement" that is actually the bug. The one
 * relative time the client owns is `SaveStatus`, which derives its own from local state
 * after mount (`specs/04-ui-spec.md` §6.6), not from this helper during render.
 *
 * `now` is injectable so the function is deterministic under test; passing nothing reads
 * the clock, which is the only impure thing here.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  let delta = (then - now.getTime()) / 1000;
  for (const { amount, unit } of DIVISIONS) {
    if (Math.abs(delta) < amount) return RELATIVE.format(Math.round(delta), unit);
    delta /= amount;
  }
  return RELATIVE.format(Math.round(delta), "year");
}

/** `"1.4 MB"` — used by the import UI to name a rejected file's size next to the cap. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${Math.round(bytes)} B`;

  const units = ["KB", "MB", "GB"] as const;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // One decimal below 10 ("1.4 MB"), none above it ("312 KB") — precision nobody reads.
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
