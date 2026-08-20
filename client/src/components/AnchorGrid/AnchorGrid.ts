/**
 * COMPATIBILITY SHIM — REFRESH task 36 (W27).
 *
 * `AnchorGrid` itself moved to `src/ui/components/AnchorGrid/`. This file is
 * NOT the component; it is a type-only re-export that exists for exactly one
 * importer:
 *
 *     src/store/__tests__/variants.test.ts:31
 *         import type { AnchorPosition } from "@/components/AnchorGrid/AnchorGrid";
 *
 * That file is part of the task-08 characterisation baseline, which has been
 * byte-unmodified for eleven consecutive waves and must stay
 * `git status --porcelain`-clean. Editing its import to chase the relocation
 * would break the freeze, so the path is kept resolvable here instead.
 *
 * ⚠️ Task 37 (which deletes `App.tsx` and finishes the components/ teardown)
 * should either re-point that import or carry this shim forward deliberately —
 * it must not be deleted as "unused", because the only consumer is a frozen
 * test whose import cannot be updated.
 *
 * Type-only on purpose: re-exporting the component here would let new code
 * import a `ui/` component through a `components/` path and quietly resurrect
 * the directory this wave is emptying.
 */
export type { AnchorPosition } from "../../utils/variantHelpers";
