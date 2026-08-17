/**
 * `src/fixtures` — sample data shared by Storybook stories AND Vitest.
 *
 * Shared, not duplicated: if the stories and the tests describe different data
 * they are not corroborating each other. See ./README.md for the rules.
 *
 * ⚠️ NOTHING in this directory may import MobX, a store, or the API. It is
 * plain data typed against `src/types`, nothing more.
 *
 * Task 10's verification greps this directory for MobX/store identifiers. That
 * grep matches COMMENTS as well as code, so the forbidden identifiers are
 * deliberately not spelled out here — see ./README.md, which states the rule in
 * prose for the same reason. The check is only meaningful if a hit means real
 * code.
 */

export * from "./colors";
export * from "./pixels";
export * from "./layers";
export * from "./frames";
export * from "./variants";
export * from "./objects";
export * from "./palettes";
export * from "./uiState";
export * from "./selection";
export * from "./projects";

import type { Project } from "@/types";
import { getProjectDense } from "./projects";

/**
 * The 12 x 12 x 8 stress fixture, as a named export alongside `projectEmpty`
 * and `projectTypical`.
 *
 * MEASURED (task 10, Bun 1.3.5): `makeProjectDense()` builds 294,912 cells in
 * **26.8 ms**. An earlier draft made this a lazy `Proxy` to avoid paying that
 * per test file; 27 ms once per process does not justify a Proxy whose
 * `ownKeys` invariants and `JSON.stringify` behaviour differ from a plain
 * object. It is a plain constant, built once at module load via the memoised
 * `getProjectDense()`.
 *
 * ⚠️ SHARED instance — read-only. Call `makeProjectDense()` for a copy you
 * intend to mutate.
 */
export const projectDense: Project = getProjectDense();
