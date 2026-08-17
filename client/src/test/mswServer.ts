/**
 * The one MSW server instance for the Vitest unit lane (REFRESH task 15).
 *
 * Lifecycle (listen / resetHandlers / close) is wired in
 * `src/test/setup.msw.ts`. Tests that need a failure scenario import `server`
 * from here and call `server.use(...scenarioHandlers())` — same module
 * instance within a worker, so `use` affects the running server.
 */
import { setupServer } from "msw/node";

import { handlers } from "@api/__mocks__/handlers";

export const server = setupServer(...handlers);
