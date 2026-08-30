/**
 * The debug sink's environment gate.
 *
 * The route is unauthenticated and accepts arbitrary JSON. That is fine on a
 * local dev server and is a liability anywhere else, so the gate is the whole
 * safety story for keeping this endpoint in the tree.
 */
import { describe, expect, it } from "vitest";
import { isDebugLogEnabled } from "../routes/debugLog.js";

describe("isDebugLogEnabled", () => {
  it("⭐ is OFF in production", () => {
    // The one case that matters: an unauthenticated write endpoint must not
    // ship. Everything else is a convenience decision.
    expect(isDebugLogEnabled("production")).toBe(false);
  });

  it("is on for development", () => {
    expect(isDebugLogEnabled("development")).toBe(true);
  });

  it("is on when NODE_ENV is unset — how `bun run dev` actually starts", () => {
    // `bun run dev` sets no NODE_ENV. Defaulting to off here would make the
    // sink silently absent in the only environment it exists to serve.
    expect(isDebugLogEnabled(undefined)).toBe(true);
  });

  it("is off under test, so suites never accumulate entries", () => {
    expect(isDebugLogEnabled("test")).toBe(false);
  });
});
