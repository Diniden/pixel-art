# 08 — Strip the probe, document, final gate, owner QA

**Wave:** W4 · **Depends on:** 01, 06, 07
**Touches:** `client/src/debug/inputProbe.ts` (deleted) · `client/src/debug/__tests__/inputProbe.dom.test.ts` (deleted) · `client/src/main.tsx` · `ARCHITECTURE.md` · `docs/18-input-modes-selection-outline/HANDOFF.md`
**Effort:** M

## Objective

The temporary probe is gone. `ARCHITECTURE.md` explains the three input modes and the
screen-space selection chrome, so the next person does not reinvent either. The full gate is green.
The owner has confirmed on real hardware that the trackpad zooms on the MacBook, the iPad is
unchanged, Windows mode behaves, and the selection line is crisp, 1 px and between pixels.
`HANDOFF.md` records all of it honestly.

## Context

- **The probe** was added in task 01: `client/src/debug/inputProbe.ts`, its test, and the
  `if (import.meta.env.DEV) bindInputProbe();` line plus its comment in `client/src/main.tsx`,
  right after `bindBrowserZoomSuppression();`.
  - Project memory says: "Strip the client instrumentation afterwards; keep the server route."
  - **Do not touch** `server/src/routes/debugLog.ts`.
  - **Use the probe once more before deleting it** (step 1). If task 01's owner capture was
    PARTIAL, this is the chance to get the before/after signal.
- **`ARCHITECTURE.md`** has sections `## 3. Client structure` (`:47-493`), `## 5. Rules that exist
  for a measured reason` (`:514`), and `## 7. Verification` (`:597`, which lists the manual
  checks at `:609`). `:248-254` already describe the shared `useCanvasViewport` engine for the
  brush studio.
- **What landed:** read `MASTER.md` §3 (D1–D21) and the `HANDOFF.md` deviations. Document what
  **actually** landed, not what was planned, if they differ.

## Steps

1. **After-fix probe capture (with the owner).**
   - `curl -s -X DELETE http://localhost:3001/api/debug/log`.
   - The owner pinches and scrolls on the MacBook in their browser. Read it back with
     `curl -s 'http://localhost:3001/api/debug/log?tag=input-probe&limit=500'`.
   - Record in HANDOFF that the gesture or ctrl-wheel events arrive **and** the canvas zoomed.
   - If the owner is unavailable, say so plainly. This whole task is then **PARTIAL**.
2. Delete `client/src/debug/inputProbe.ts` and its test. Remove the directory if it is empty.
   Remove the binding and its comment from `main.tsx`, and check that `main.tsx` is otherwise
   byte-identical to `096513f` (`git diff 096513f -- client/src/main.tsx` is empty).
3. **Commit** as `chore(18/08): remove temporary input probe`.
4. `ARCHITECTURE.md`:
   - Add a subsection under §3, **"Input modes (ipad / mac / windows)"**. Cover:
     - where detection lives (`ui/canvas/model/inputMode.ts`);
     - the detection order;
     - the override key and how to set or clear it;
     - the mode table (from `wheelIntent.ts`);
     - the Safari `gesture*` path (`ui/hooks/useGestureZoom.ts`), why it is off on the iPad, and
       the dedupe;
     - that the document-level suppressor still blocks page zoom.
   - Add a subsection **"Screen-space selection chrome"**. Cover:
     - why the ants and lasso live outside `.canvas__layout`;
     - the device-pixel snapping rule;
     - `useScreenPixelGrid`;
     - that the variant box, grid, brush and hover outlines are still cell-space;
     - a pointer to `screenChrome.ts`.
   - Under §5, add a rule: **never draw screen-constant chrome inside the CSS-scaled
     `.canvas__layout`**, with the measured reason (the 2026-09-27 blur report).
   - Under §7's manual list, add: trackpad pinch on the Mac (Safari and Chrome), iPad pinch speed,
     and crisp selection at zoom 1/7/50.
   - Keep the file's style: short, measured and dated.
5. **Commit** as `docs(18/08): ARCHITECTURE — input modes, screen-space selection chrome`.
6. **Run the full gate**, and paste the real output into HANDOFF:
   ```sh
   bun run verify                                     # repo root: typecheck, lint, format:check, test, build — exit 0
   cd client && bun scripts/check-boundaries.mjs
   cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # nothing
   git diff 096513f --stat -- client/src/test/__fixtures__ '**/__snapshots__/**'   # nothing (no snapshot updated)
   git diff 096513f --stat -- client/src/stores client/src/types client/src/services server   # nothing
   ```
7. **Owner manual QA matrix.** Record each row in HANDOFF as PASS, FAIL or NOT RUN (with the
   reason):

   | # | Device / mode | Check |
   | --- | --- | --- |
   | 1 | MacBook · Safari | Trackpad pinch zooms about the fingers; no page zoom; two-finger scroll pans; ⌘+scroll zooms |
   | 2 | MacBook · Chrome | Pinch zooms (same feel as before); two-finger scroll pans |
   | 3 | MacBook · lighting + brush studios | Pinch zooms in both |
   | 4 | MacBook · `pixelart.inputMode=windows` override | Mouse notch (if a mouse is present) = one ×1.2 step; trackpad scroll pans; ctrl+scroll zooms; override cleared afterwards |
   | 5 | iPad | Finger pinch zooms at the old speed (not double); two-finger pan; Pencil draws; no page zoom |
   | 6 | Any · rect selection | Crisp 1 px dashed line at zoom 1, ~7 and max; same thickness at each |
   | 7 | Any · high zoom | Line lies on the boundary between selected and unselected cells (inspect a corner) |
   | 8 | Any · lasso at high zoom | Rubber band is thin (1 px), not fat |
   | 9 | Any · pan/zoom with a selection | Line stays crisp and glued to the art; no blur, no lag |
   | 10 | MacBook · drag the window to an external (1×) display | Line still crisp (DPR change re-snaps) |
   | 11 | Brush studio | Selection outline crisp, same as pixel studio |
   | 12 | Windows machine (if the owner has one) | Detection picks `windows` without an override; row 4's checks |

8. Update `HANDOFF.md`:
   - the ledger row;
   - the gate output;
   - the QA matrix;
   - follow-ups (MASTER D21's out-of-scope items the owner may want next: variant box on the
     screen layer, `ReferenceImageModal` wheel modes, an input-mode UI toggle, mask-edge tracing);
   - set **Current position** to done, or to PARTIAL with the rows that were not run.
9. **Commit** as `docs(18/08): final gate + QA ledger`.

## Constraints

- Do not delete or change the server debug-log route.
- No application behaviour change in this task beyond removing the probe.
- Never mark DONE with a QA row NOT RUN. Mark the plan **PARTIAL** and list the rows.

## Verification

- The gate in step 6 exits 0, with the output pasted.
- `grep -rn "inputProbe" client/src` prints nothing.
- `bun run dev` starts, and the heartbeat **no longer** appears at
  `GET /api/debug/log?tag=input-probe` after a fresh `DELETE` and a page load.
- The QA matrix is filled in.

## Definition of done

- [ ] The probe is removed, and `main.tsx` is identical to `096513f`.
- [ ] `ARCHITECTURE.md` has both subsections, the §5 rule and the §7 manual checks.
- [ ] `bun run verify` exits 0, with the output pasted. The boundary check passes. No lockfile, no
      snapshot, no store/types/services/server diff.
- [ ] The QA matrix is recorded, with every row PASS or explicitly NOT RUN with a reason. The plan
      status reflects that honestly.
- [ ] Three commits.
