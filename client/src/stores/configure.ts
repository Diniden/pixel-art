/**
 * MobX strict-mode configuration (task 14).
 *
 * Importing this module configures MobX globally, exactly once. It is imported
 * at the top of `ApplicationStore.ts`, so constructing a store anywhere —
 * `main.tsx`, a Vitest test, a Storybook decorator — guarantees strict mode is
 * active before the first observable exists.
 *
 * All five strictness flags are ON in development and in tests. In production
 * `enforceActions: "always"` stays on (it is a correctness guarantee, not a
 * dev aid) and the three `*RequiresReaction` warnings are disabled — they only
 * log, but they log on hot paths.
 *
 * `observableRequiresReaction` WILL be noisy during the migration, because the
 * bridge era mixes MobX reads with Zustand-land code. That is accepted
 * deliberately: every warning it emits marks a component that has not been
 * migrated yet — a free progress meter (MASTER.md R7).
 */
import { configure } from "mobx";

const strict = !import.meta.env.PROD;

configure({
  // Every observable write must be inside an action/flow. The bridge's writes
  // are wrapped in `runInAction` for exactly this reason.
  enforceActions: "always",
  // Catches computeds read outside a reactive context.
  computedRequiresReaction: strict,
  // Catches reactions with no observable deps (silent no-ops).
  reactionRequiresObservable: strict,
  // Catches observables read outside observer/reaction. Noisy by design — see
  // the module comment.
  observableRequiresReaction: strict,
  // Keep React error boundaries working.
  disableErrorBoundaries: false,
  // Default; prevents monkey-patching store methods.
  safeDescriptors: true,
});
