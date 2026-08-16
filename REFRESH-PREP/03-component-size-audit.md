# P1-03 — Component & File-Size Audit

**Wave:** P1 · **Depends on:** nothing · **Output:** `REFRESH-PREP/findings/component-sizes.md`

## Expert profile

You are a React refactoring specialist. You can look at a 3,000-line component
and identify the natural seams — the hook that wants to be extracted, the
sub-component hiding in a JSX branch, the pure function tangled into an event
handler. You know that "split by line count" is wrong and "split by
responsibility" is right.

## Context

31 component folders in `client/src/components/`, zero tests, zero stories.
The worst offenders by line count:

| File | Lines |
| --- | --- |
| `components/Canvas/Canvas.tsx` | 3,062 |
| `store/variantActions.ts` | 1,412 |
| `components/AIInterpolateModal/AIInterpolateModal.tsx` | 1,252 |
| `types/index.ts` | 1,086 |
| `store/lightingActions.ts` | 1,036 |
| `components/Canvas/LightingCanvas.tsx` | 937 |
| `server/src/routes/export.ts` | 927 |
| `components/ReferenceImageModal/ReferenceImageModal.tsx` | 869 |
| `store/layerClipboardActions.ts` | 837 |
| `components/FrameTimeline/TimelineView.tsx` | 836 |
| `store/layerActions.ts` | 763 |
| `components/FrameTimeline/FramesView.tsx` | 684 |
| `components/ColorPicker/ColorPicker.tsx` | 673 |
| `store/selectionActions.ts` | 651 |
| `components/ObjectLibrary/ObjectLibrary.tsx` | 643 |
| `components/FrameTimeline/VariantView.tsx` | 617 |

Line count is the *symptom*. Your job is to diagnose the *cause* per file.

## Your task

1. **Verify and extend the size census.** Include every `.ts`/`.tsx` in
   `client/src` and `server/src` over 250 lines. Line count alone is not enough —
   for each, also record: number of exported symbols, number of `useState`/
   `useEffect` calls, number of distinct responsibilities, JSX depth.

2. **Deep-dive the top 8 files.** For each, produce a **decomposition proposal**:
   - What responsibilities are currently fused together (name them).
   - The proposed file structure after the split, with concrete filenames.
   - Which extracted pieces are **pure** (no store, no side effects) — these
     become the Storybook-able presentational components.
   - Which become **custom hooks** (`useCanvasPointer`, `useCanvasRender`, …).
   - Which become **plain utility modules** (pure functions, testable directly).
   - Estimated effort: S (< 2h) / M (half day) / L (multi-day).
   - **Risk of regression**, and what would have to be tested to de-risk it.

   `Canvas.tsx` at 3,062 lines is the flagship. Give it disproportionate
   attention — likely seams include: pointer/mouse event handling, the render
   loop, zoom/pan transform math, per-tool drawing behavior, overlay rendering
   (grid, selection, reference image), and keyboard shortcuts. Verify against the
   actual code; do not assume.

3. **Cross-cutting duplication.** Find logic repeated across components that
   should be shared. Look especially at:
   - `Canvas.tsx` vs `LightingCanvas.tsx` — how much render/interaction code is
     duplicated between them?
   - `FrameTimeline/` — `TimelineView` (836), `FramesView` (684), `VariantView`
     (617) look like three variations on one grid. Quantify the overlap.
   - The 14 modal components — is there a shared `Modal` primitive waiting to be
     extracted? Check for repeated backdrop/escape-key/focus-trap logic.

4. **Missing primitives inventory.** List the low-level UI primitives that
   *should* exist but don't (Button, IconButton, Modal, Panel, Slider,
   NumberInput, Tooltip, ContextMenu, Toggle…). For each, cite 2+ places where it
   is currently reimplemented inline.

5. **`types/index.ts` (1,086 lines).** This holds domain types *and* the
   compact-format serializers (`projectToCompact`, `compactToProject`,
   `migrateLegacyLayer`). Propose a split separating pure type declarations from
   serialization logic.

6. **Server `export.ts` (927 lines).** Same treatment: identify responsibilities
   and propose a decomposition.

7. **Dead code sweep.** Find exports that are never imported, commented-out
   blocks, unreachable branches. List with file:line. Be conservative — flag
   only what you can verify, and note anything reachable via dynamic import.

## Output format

Write `REFRESH-PREP/findings/component-sizes.md`:

```markdown
# Component & File-Size Audit

## Summary

## Size census
| File | Lines | Exports | Hooks | Responsibilities | Verdict |

## Decomposition proposals
### <file> (<lines> lines)
**Fused responsibilities:** …
**Proposed structure:**
```
ComponentName/
  ComponentName.tsx          — <role>
  useSomething.ts            — <role>
  somethingUtils.ts          — pure, testable
  parts/SubThing.tsx         — pure, Storybook-able
```
**Pure extractions:** …
**Effort:** S/M/L · **Regression risk:** low/med/high
**Must-test-before-refactor:** …

## Duplication clusters
| Cluster | Files | Est. duplicated lines | Shared abstraction |

## Missing primitives
| Primitive | Reimplemented at | Priority |

## Dead code
| File:line | What | Confidence |

## Recommended split order
<sequenced, with dependencies noted and what can go in parallel>

## Proposed work items
| Title | Touches (explicit files/dirs) | Depends on | Effort | Risk |

## Verification
| Work item | Command(s) | Manual checks |

## Open questions
```

## Definition of done

- Every source file over 250 lines is in the census with a verdict.
- The top 8 have full decomposition proposals with concrete filenames.
- `Canvas.tsx` has a detailed, seam-by-seam plan grounded in its actual code.
- The missing-primitives list cites real duplicate call sites.
