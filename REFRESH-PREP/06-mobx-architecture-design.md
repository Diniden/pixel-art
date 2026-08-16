# P2-06 — MobX Store Architecture Design

**Wave:** P2 · **Depends on:** 02 (store-state), 05 (api-contract)
**Output:** `REFRESH-PREP/findings/mobx-architecture.md`

## Expert profile

You are a MobX architect. You've built and maintained large `ApplicationStore` /
domain-store applications. You know `makeAutoObservable` vs `makeObservable`,
when a computed beats a reaction, why `observer` placement determines render
granularity, and how to keep observable domain models from leaking into
presentational components.

## Prerequisites

Read before starting:
- `REFRESH-PREP/findings/store-state.md` — the full state inventory and DOMAIN /
  UI / SESSION / TRANSIENT classification.
- `REFRESH-PREP/findings/api-contract.md` — the target API layer your
  `DomainStore` will consume.

## Locked decision

Migrate Zustand → MobX with `ApplicationStore` composed of `SessionStore`,
`DomainStore`, `UIStore`, per the owner's stated roles:

- **SessionStore** — user, profile, login.
- **DomainStore** — state loaded from the server.
- **UIStore** — complex UI state; sorting and mutating domain data into
  structures React can consume easily.

Design to this shape. If audit 02 flagged that there is no auth/user today,
handle it as described in "Handling the empty SessionStore" below rather than
dropping the store.

## Your task

1. **Define the store tree.** Concrete classes, files, and responsibilities:

   ```
   client/src/stores/
     ApplicationStore.ts        — root; constructs and wires children
     session/SessionStore.ts
     domain/DomainStore.ts      — + sub-stores as needed
     ui/UIStore.ts              — + sub-stores as needed
     context.ts                 — React context + typed hooks
   ```

   The current store has 17 action modules and ~4,500 lines. `DomainStore` and
   `UIStore` must **not** become two new god objects. Define sub-stores
   (e.g. `ProjectStore`, `VariantStore`, `LightingStore` under domain;
   `CanvasUIStore`, `TimelineUIStore`, `SelectionStore`, `ToolStore`,
   `ModalStore` under UI) with a hard guideline: **no store file over ~300 lines**.

2. **Map every current field to its destination.** Take the inventory from
   findings 02 and produce an exhaustive table:

   | Current `EditorState` field | Destination store | Observable / computed / action | Notes |

   Every field must appear. Resolve everything audit 02 marked contested, and
   record the reasoning for each resolution.

3. **Map every current action.** All 17 `create*Actions` modules → their new
   homes. Note which become `action` methods, which become `flow` (async), and
   which are actually derived reads that should become `computed`.

4. **Design the computed layer.** This is the heart of the UIStore mandate —
   "mutating the Domain data into useful structures for React". Identify the
   derived views components need (sorted layer lists, visible frame ranges,
   flattened variant trees, the active frame's composited layers, palette
   groupings) and specify each as a computed with its inputs. Call out any that
   need `computedFn` / `createTransformer` for parameterized memoization.

5. **Solve undo/redo.** Currently 100 deep-cloned project snapshots via
   `projectToCompact`/`compactToProject`. Under MobX, choose and justify one:
   - manual snapshot stack (closest to today),
   - `mobx-state-tree` / `mobx-keystone` with built-in patches,
   - a custom patch-recording middleware.

   Give a **single recommendation** with a migration path and an honest memory
   comparison against today's approach. Undo/redo regressions are the most
   likely way this migration breaks user-visible behavior — treat it as the
   critical path.

6. **Auto-save under MobX.** Replace the current `setOnSaveStatusChange` callback
   wiring with a proper `reaction`. Specify exactly what is observed, the
   debounce, and where save status lives (likely `SessionStore`). Ensure a save
   is not triggered by undo/redo replay or by initial hydration.

7. **React integration contract.** Specify:
   - Provider setup and typed hooks (`useStores()`, `useDomainStore()`, …).
   - Where `observer()` goes. **Rule: only container components are observers;
     presentational components take plain props and are never observers.**
     State this explicitly — it's what makes Storybook work.
   - How observable domain objects are converted to plain props at the container
     boundary (this matters: passing observables into presentational components
     silently recreates the coupling we're removing).
   - Strict mode config (`configure({ enforceActions: "always" })` and friends)
     with a recommendation.

8. **Migration strategy.** The single most important practical question: can
   MobX and Zustand coexist during the migration, or is it a hard cutover?
   Analyze honestly given that 35 files import `useEditorStore`. If incremental,
   define the bridge and the exact slice-by-slice order. If big-bang, say so
   plainly and describe how to keep the app runnable. Recommend one.

9. **Testing approach.** How stores are unit-tested with Vitest without React,
   and how they're mocked/stubbed for Storybook.

10. **Handling the empty SessionStore.** If there's no auth today, define
    `SessionStore` as a real but thin store owning app-session concerns — save
    status, connection/online state, current project handle, user preferences —
    and document the seam where real auth would slot in later. Do not create an
    empty placeholder class with nothing in it.

## Output format

Write `REFRESH-PREP/findings/mobx-architecture.md`:

```markdown
# MobX Architecture Design

## Summary

## Store tree
<file layout + one-line responsibility each + projected LOC>

## Field migration map
| Current field | Destination | Kind | Notes |

## Action migration map
| Current action | Module | Destination | Kind (action/flow/computed) |

## Computed layer
| Computed | Store | Inputs | Consumers | Memoization |

## Undo/redo design
<options considered, recommendation, migration path, memory comparison>

## Auto-save reaction
<observed state, debounce, status location, replay/hydration guards>

## React integration
### Provider & hooks
### observer() placement rules
### Observable → plain props boundary
### Strict mode config

## Migration strategy
<incremental vs big-bang, recommendation, ordered slice sequence>

## Testing approach

## SessionStore definition

## Risks
| Risk | Severity | Mitigation |

## Proposed work items
| Title | Touches (explicit files/dirs) | Depends on | Effort | Risk |

## Verification
| Work item | Command(s) | Manual checks |

## Open questions
```

## Definition of done

- Every field and action from findings 02 has a mapped destination.
- No proposed store file is projected over ~300 lines.
- Undo/redo has one concrete recommended design, not a menu.
- The migration strategy is decisive and ordered.
- `observer()` placement rules are explicit enough to enforce in review.
