import { Router, type Request, type Response } from "express";

/**
 * A debug log sink for on-device diagnosis. **Development builds only.**
 *
 * ## Why this exists
 *
 * An iPad running the editor in the companion app has no console, no
 * inspector, and no way to show what the browser is actually doing. That made
 * the 2026-08-28 touch-gesture failure impossible to diagnose from the code:
 * three separate hypotheses were reasoned out and shipped, and every one was
 * wrong, because none of them was based on an observed signal.
 *
 * This endpoint is the fix for that process problem. The client posts raw
 * pointer events here, the server prints them, and the actual behaviour of the
 * hardware becomes visible in the terminal running `bun run dev`.
 *
 * ## Scope, deliberately
 *
 * This is a DIAGNOSTIC, not a product feature:
 *
 * - It holds a bounded in-memory ring buffer and writes nothing to disk. The
 *   owner's project data is the highest-severity thing in this repo and a
 *   debug path must not be able to touch it.
 * - Entries are capped so a runaway pointer stream cannot exhaust memory:
 *   an Apple Pencil emits samples at up to 240 Hz.
 *
 * ## ⚠️ Why it is gated to development
 *
 * The route is UNAUTHENTICATED and accepts arbitrary JSON, which is fine on a
 * local-network dev server and is not fine anywhere else: in production it
 * would be an unauthenticated write endpoint that any client on the network
 * could use to fill the process's memory, and a read endpoint that hands back
 * whatever was written. {@link isDebugLogEnabled} keeps it off unless
 * `NODE_ENV` is explicitly a development value, so shipping it is inert rather
 * than dangerous.
 *
 * The kept-for-later decision (owner, 2026-08-28) is about the DEV workflow:
 * an iPad has no console, so this is the only way to see what the device is
 * really doing. It earned that when it disproved three wrong diagnoses of the
 * touch failure in one run.
 */

/** One logged entry, as the client sent it plus when it arrived. */
export interface DebugLogEntry {
  /** Server receive time, ISO-8601. */
  at: string;
  /** Free-form channel, e.g. "touch". */
  tag: string;
  /** The payload the client sent. */
  data: unknown;
}

/**
 * How many entries to retain.
 *
 * A Pencil reports up to 240 samples per second, so a few seconds of gesture
 * is already a thousand entries. This is sized to hold a whole test gesture
 * while staying bounded.
 */
const MAX_ENTRIES = 5000;

const entries: DebugLogEntry[] = [];

/**
 * True when the sink should be mounted at all.
 *
 * Defaults to ENABLED when `NODE_ENV` is unset, because that is how the dev
 * server is normally started (`bun run dev` sets nothing) and a diagnostic
 * that silently does nothing in the environment it exists for is worse than
 * useless. Anything that explicitly says "production" turns it off.
 */
export function isDebugLogEnabled(
  ...args: [env?: string | undefined]
): boolean {
  // ⚠️ Not a default parameter. `isDebugLogEnabled(undefined)` must mean
  // "evaluate an UNSET NODE_ENV", not "fall back to the ambient one" — and a
  // default would silently do the latter, which made the unset case
  // untestable under a runner that sets NODE_ENV=test itself.
  const env = args.length > 0 ? args[0] : process.env.NODE_ENV;
  return env !== "production" && env !== "test";
}

/** Push one entry, evicting the oldest past the cap. */
function record(tag: string, data: unknown): DebugLogEntry {
  const entry: DebugLogEntry = {
    at: new Date().toISOString(),
    tag,
    data,
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  return entry;
}

export const debugLogRouter = Router();

/**
 * `POST /api/debug/log` — accept one entry, or a batch.
 *
 * Batching matters: a pointer stream at 240 Hz would otherwise be 240 requests
 * per second, and the network overhead would itself perturb the gesture being
 * measured. The client buffers and flushes.
 *
 * Always answers 200 with a count, even for a malformed body. A diagnostic
 * that makes the client throw would corrupt the very gesture it is measuring.
 */
debugLogRouter.post("/debug/log", (req: Request, res: Response) => {
  const body = req.body as
    | { tag?: unknown; entries?: unknown; data?: unknown }
    | undefined;

  const tag = typeof body?.tag === "string" ? body.tag : "debug";
  const batch = Array.isArray(body?.entries) ? body.entries : [body?.data];

  let written = 0;
  for (const item of batch) {
    if (item === undefined) continue;
    const entry = record(tag, item);
    written++;
    // The whole point: make it visible in the dev terminal as it arrives.
    console.log(`[debug:${entry.tag}] ${JSON.stringify(entry.data)}`);
  }

  res.json({ ok: true, written, total: entries.length });
});

/**
 * `GET /api/debug/log` — read the buffer back.
 *
 * `?tag=` filters, `?limit=` takes the most recent N (default 500). This is
 * how a coding agent reads what the device did without watching the terminal.
 */
debugLogRouter.get("/debug/log", (req: Request, res: Response) => {
  const tag = typeof req.query.tag === "string" ? req.query.tag : undefined;
  const rawLimit = Number(req.query.limit);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), MAX_ENTRIES)
      : 500;

  const filtered = tag ? entries.filter((e) => e.tag === tag) : entries;
  res.json({
    total: filtered.length,
    entries: filtered.slice(-limit),
  });
});

/** `DELETE /api/debug/log` — drop everything, so a run starts clean. */
debugLogRouter.delete("/debug/log", (_req: Request, res: Response) => {
  const cleared = entries.length;
  entries.length = 0;
  res.json({ ok: true, cleared });
});
