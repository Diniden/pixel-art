# P1-02 — Store & State-Flow Audit

**Wave:** P1 · **Depends on:** nothing · **Output:** `REFRESH-PREP/findings/store-state.md`

## Expert profile

You are a state-management architect fluent in both Zustand and MobX. You can
read a 4,500-line flat store and tell the difference between *server-owned data*,
*derived view state*, and *ephemeral interaction state* — which is exactly the
distinction the Domain/UI split depends on.

## Context

The client uses **Zustand 4.5**, one flat `EditorState` assembled in
`client/src/store/index.ts` from 17 `create*Actions` module factories:

```
colorAdjustmentActions.ts  16K    layerClipboardActions.ts  30K
drawingActions.ts          13K    lightingActions.ts        37K
frameActions.ts            11K    objectActions.ts           7K
helpers.ts                  3K    paletteActions.ts          2K
index.ts                    6K    projectActions.ts          6K
layerActions.ts            26K    referenceActions.ts        3K
selectionActions.ts        22K    storeTypes.ts             15K
timelineActions.ts         10K    toolActions.ts            12K
variantActions.ts          45K
```

**35 of ~40** client source files import `useEditorStore` directly.

This project is migrating to **MobX** with `ApplicationStore` →
`SessionStore` / `DomainStore` / `UIStore`. Your audit is the input to that
design. **You are not designing the MobX store** — task 06 does that. You are
producing the complete, accurate inventory it needs.

## Your task

1. **Full state inventory.** Read `store/storeTypes.ts` and every action module.
   Produce a table of every field on `EditorState`: name, type, who writes it,
   who reads it.

2. **Classify every field** into exactly one bucket. This is the core deliverable:

   | Bucket | Meaning |
   | --- | --- |
   | `DOMAIN` | Server-owned truth. Loaded from / persisted to the API. The `Project` tree, objects, frames, layers, variants, palettes. |
   | `UI` | Derived or view-shaping state. Selection, sort order, zoom, active tool, panel open/closed, modal visibility, the structures that mutate domain data into render-ready form. |
   | `SESSION` | User / profile / auth / connection-level. **Note:** this app may have none today — say so plainly if true, and note what SessionStore would hold in future (see open questions). |
   | `TRANSIENT` | Should not live in a store at all — belongs in component-local state or a ref. |

   Where a field is genuinely ambiguous, put it in a `## Contested` section with
   the argument for each side. Do not silently pick.

3. **Undo/history analysis.** `index.ts` implements history via
   `updateProjectAndSave` with `MAX_HISTORY = 100`, deep-cloning through
   `projectToCompact` / `compactToProject`. Document:
   - Exactly which mutations track history and which don't.
   - The memory cost of the current approach (100 full project clones).
   - How this must work under MobX — this is the single hardest part of the
     migration. Note whether `mobx-keystone`, `mobx-state-tree`, or a manual
     patch-recording approach is warranted, with a recommendation.

4. **Auto-save coupling.** `store/index.ts` wires `setOnSaveStatusChange` from
   `services/autoSave.ts` and calls `scheduleAutoSave`. Map this flow completely:
   what triggers a save, what the debounce is, how save status propagates, and
   what breaks if the store is split into three.

5. **Cross-module coupling map.** Which action modules call into which others via
   `get()`? Build the dependency graph. Identify cycles. This determines what can
   be split apart cleanly and what is tangled.

6. **The ReferenceImageModal problem.** `App.tsx` imports
   `restoreReferenceImageFromProject`, `saveReferenceImageToProject`, and
   `getCurrentReferenceImageData` **from a modal component**. Read
   `components/ReferenceImageModal/ReferenceImageModal.tsx` and document the
   module-level mutable state hiding there, everything that depends on it, and
   where it must move to.

7. **Consumer coupling census.** For each of the 35 files importing
   `useEditorStore`: which specific fields/actions does it pull? Produce a table.
   This tells task 07 which components are nearly-pure already and which are
   deeply entangled.

8. **Persistence format.** Document `projectToCompact` / `compactToProject` in
   `types/index.ts` and the several migration paths in `services/api.ts`
   (`needsVariantMigration`, `migrateLegacyProject`, `migrateLegacyLayer`).
   These migrations must survive the refactor — enumerate them precisely.

## Output format

Write `REFRESH-PREP/findings/store-state.md`:

```markdown
# Store & State-Flow Audit

## Summary

## State inventory
| Field | Type | Bucket | Written by | Read by | Notes |

## Contested classifications
### <field>
- Case for DOMAIN: …
- Case for UI: …
- Recommendation: …

## Action module map
| Module | LOC | Responsibility | Calls into | Called by |

## Coupling graph
<text/mermaid graph; call out cycles>

## Undo & history
<mechanism, cost, MobX recommendation>

## Auto-save flow
<trigger → debounce → API → status propagation>

## ReferenceImageModal hidden state
<what it is, who depends on it, where it goes>

## Consumer census
| File | Fields used | Actions used | Entanglement (low/med/high) |

## Persistence & migrations
<compact format, each legacy migration path, what must be preserved>

## Risks for the MobX migration
<ordered by severity>

## Proposed work items
| Title | Touches (explicit files/dirs) | Depends on | Effort | Risk |

## Verification
| Work item | Command(s) | Manual checks |

## Open questions
```

## Definition of done

- Every field on `EditorState` is classified, or explicitly listed as contested.
- The coupling graph names cycles, or states that none exist.
- The history mechanism has a concrete MobX recommendation.
- All 35 consumer files appear in the census.

## Explicit open question to raise

This app appears to have **no auth, no user, and no profile**. Ask in your
`## Open questions` whether `SessionStore` should be (a) created as a thin
placeholder holding connection/save status and app-level preferences, or
(b) deferred entirely. Give a recommendation — do not decide unilaterally.
