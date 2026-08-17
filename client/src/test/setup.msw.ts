/**
 * MSW lifecycle for the unit lane (REFRESH task 15).
 *
 * `onUnhandledRequest: "error"`: an un-mocked endpoint FAILS the test. This is
 * what keeps the mock catalogue honest — a new endpoint cannot sneak in
 * without a handler, and no unit test can silently hit a real network.
 *
 * Tests that stub `fetch` themselves (the pinned characterisation suites)
 * simply bypass MSW for those calls; `vi.unstubAllGlobals()` in
 * `setup.unit.ts` restores the intercepted fetch afterwards.
 */
import { afterAll, afterEach, beforeAll } from "vitest";

import { server } from "./mswServer";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
