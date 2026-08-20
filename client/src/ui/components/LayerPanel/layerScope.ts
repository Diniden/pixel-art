/**
 * The two axes the seven collapsed LayerPanel callbacks are parameterised on
 * (REFRESH task 35, MASTER.md §9.5).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  SEVEN CALL-SITE CALLBACKS → TWO. THE FOUR STORE ACTIONS ARE UNTOUCHED.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Before this task `LayerPanel` wired seven distinct store members straight
 * into seven buttons:
 *
 *   moveLayer(from, to)                      ← the two per-row arrows
 *   moveLayerAcrossAllFrames(id, direction)  ← the two header arrows
 *   squashLayerDown(id)                      ← per-row squash down
 *   squashLayerUp(id)                        ← per-row squash up
 *   squashLayerDownAcrossAllFrames(id)       ← header squash down
 *   squashLayerUpAcrossAllFrames(id)         ← header squash up
 *   deleteLayerAcrossAllFrames(id)           ← header delete
 *
 * They collapse to `onMoveLayer(id, direction, scope)` and
 * `onSquashLayer(id, direction, scope)`, plus `onDeleteLayer(id, scope)`
 * folding the seventh into the row's existing delete. Six of the seven become
 * two; the delete pair becomes one. `LayerPanelContainer` is the only place
 * that maps a `(direction, scope)` pair back to a concrete store action.
 *
 * ── ⚠️ WHAT THIS COLLAPSE IS NOT ──────────────────────────────────────────
 *
 * **The four `squash*` store actions stay four distinct methods.** W17 ported
 * them one-for-one precisely because task 08 measured that they genuinely
 * disagree, and a test asserts the implementations differ:
 *
 *   - the `Up` variants composite the LOWER layer OVER the upper (an
 *     inverted blend relative to the `Down` variants),
 *   - the all-frames variants match layers by INDEX while the frame-scoped
 *     ones match by ID,
 *   - their guards are asymmetric,
 *   - `visible` is ignored by some and not others.
 *
 * Those differences are pinned as characterisation tests, not bugs to fix.
 * Unifying the ACTIONS would silently change behaviour on the owner's real
 * data; unifying the CALL SITES cannot, because the container still dispatches
 * to exactly the same four methods it did before. That distinction is the
 * whole point of §9.5 and it is why this file defines types rather than a
 * shared implementation.
 */

/**
 * Which frames an operation touches.
 *
 * ⚠️ `"allFrames"` does NOT mean "the frame operation, repeated". The
 * all-frames store actions match layers by index and carry their own guards —
 * see the header. Verify both scopes separately; a change that looks correct
 * in one can be wrong in the other.
 */
export type LayerScope = "frame" | "allFrames";

/** Direction for a move or a squash. Up = toward the top of the z-stack. */
export type MoveDirection = "up" | "down";
