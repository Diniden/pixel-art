# REFRESH-PREP — Master Plan

The planning phase for the pixel-art refresh. Each task in this folder is a
**self-contained audit assignment** for one expert agent.

## The flow

```
REFRESH-PREP tasks  →  REFRESH-PREP/findings/*.md  →  REFRESH/  (execution plan)
   (audit)                  (evidence)                 (written by task 09)
```

`REFRESH/` **does not exist yet.** It is authored entirely by task 09, from the
findings the earlier tasks produce. Nothing in this folder pre-decides the shape
of the execution plan — no wave count, no task count, no task boundaries. Those
are derived from evidence.

**Goal of this phase:** replace assumptions with measured facts before anyone
edits application code. No task in this folder modifies source files.

---

## Decisions already locked (do not re-litigate)

Decided by the project owner up front. Audit tasks plan *around* these, not
against them.

| Decision | Value |
| --- | --- |
| State library | **Migrate Zustand → MobX.** `ApplicationStore` composed of `SessionStore`, `DomainStore`, `UIStore`. |
| Tooling | **Storybook + Vitest + Testing Library + ESLint (flat) + Prettier.** Full harness. |
| CSS | **BEM** for every component. |
| UI/state coupling | UI components **fully divorced** from the store; containers wire them together. |
| Storybook scope | Stories bubble up: primitives → components → **full-page Layouts**. |
| API | A **single typed API layer**, isolated from both UI and store. |
| Runtime | **Bun.** `npm` is not on PATH — use `bun` / `bunx` in every command. |

---

## Ground-truth snapshot (measured 2026-08-16)

Established by direct inspection. Audit tasks should verify and extend these,
not re-derive them from scratch.

- **Client:** React 18.3 + Vite 5.4 + TypeScript 5.6, **Zustand 4.5** (not MobX).
- **Store:** 17 files in `client/src/store/`, ~4,500 lines, one flat `EditorState`
  built by a single `create<EditorState>()` call in `store/index.ts`.
- **Coupling:** **35 of ~40** client source files import `useEditorStore` directly.
- **Components:** 31 component folders, global kebab-case CSS, **no BEM**, no CSS modules.
- **Tests / stories:** **zero.** No test runner, no Storybook.
- **Lint:** `client` declares a `lint` script but **no ESLint config file exists**.
- **Largest offenders:** `Canvas.tsx` 3,062 · `variantActions.ts` 1,412 ·
  `AIInterpolateModal.tsx` 1,252 · `types/index.ts` 1,086 · `FrameTimeline.css` 1,061 ·
  `lightingActions.ts` 1,036 · `LightingCanvas.tsx` 937 · `export.ts` (server) 927 ·
  `ReferenceImageModal.tsx` 869 · `layerClipboardActions.ts` 837 · `TimelineView.tsx` 836.
- **Known architectural smell:** `App.tsx` imports state functions
  (`restoreReferenceImageFromProject`, `saveReferenceImageToProject`,
  `getCurrentReferenceImageData`) *from a modal component* —
  `components/ReferenceImageModal/ReferenceImageModal.tsx`. Module-level mutable
  state lives inside a UI component.
- **Server:** Express 4 + sharp, 3 route files, JSON-file persistence under
  `server/src/data/` with gzipped backups spanning Jan–Jul 2026.
- **AI service:** Python FastAPI (`ai-service/`), async job model, separate lifecycle.

---

## Waves

Tasks inside a wave are independent and run in parallel. A wave starts only when
the previous wave is fully complete.

### Wave P1 — Independent discovery (5 agents, parallel)

No inter-task dependencies. Launch all five together.

| Task | File | Output |
| --- | --- | --- |
| Dependency & toolchain audit | `01-dependency-audit.md` | `findings/dependencies.md` |
| Store & state-flow audit | `02-store-state-audit.md` | `findings/store-state.md` |
| Component & file-size audit | `03-component-size-audit.md` | `findings/component-sizes.md` |
| CSS & styling audit | `04-css-audit.md` | `findings/css.md` |
| API & server-contract audit | `05-api-contract-audit.md` | `findings/api-contract.md` |

### Wave P2 — Synthesis (3 agents, parallel)

Each reads Wave P1 findings and produces a target design.

| Task | File | Reads | Output |
| --- | --- | --- | --- |
| MobX store architecture design | `06-mobx-architecture-design.md` | store-state, api-contract | `findings/mobx-architecture.md` |
| Component/Layout taxonomy & Storybook plan | `07-component-taxonomy.md` | component-sizes, css | `findings/component-taxonomy.md` |
| Tooling & migration-safety plan | `08-tooling-plan.md` | dependencies, component-sizes | `findings/tooling.md` |

### Wave P3 — Authoring (1 agent, solo)

| Task | File | Reads | Output |
| --- | --- | --- | --- |
| Author the REFRESH plan | `09-author-refresh-plan.md` | all 8 findings | **the entire `REFRESH/` folder** |

---

## Execution order

```
P1: 01 02 03 04 05     (parallel, 5 agents)
        ↓
P2: 06 07 08           (parallel, 3 agents)
        ↓
P3: 09                 (solo)
        ↓
    REFRESH/ created — execution can begin
```

---

## What every audit must hand up for wave planning

Task 09 builds `REFRESH/`'s waves from your findings. It can only do that if you
supply the raw material. **Every P1 and P2 findings file must end with these
three sections**, in addition to whatever its own task specifies:

### `## Proposed work items`

The discrete units of work your audit implies. For each:

| Field | Meaning |
| --- | --- |
| Title | What the work is |
| Touches | **Explicit file/directory list.** Task 09 uses this to detect collisions between parallel tasks — it is the single most important field. |
| Depends on | Other work items (by title) that must complete first, and why |
| Effort | S (< 2h) / M (half day) / L (multi-day) |
| Risk | What could regress, and how it would be detected |

Size these to roughly one agent-session. If something is bigger, propose it as
several sequential items rather than one large one.

### `## Verification`

For each work item, the command(s) that prove it succeeded, and anything that
requires manual checking. Commands must be runnable and exit non-zero on failure.

### `## Open questions`

Anything you could not resolve. Mark each as blocking (names the work item it
blocks) or non-blocking (state the assumption to proceed under). Having open
questions is expected, not a failure.

---

## Rules for every REFRESH-PREP agent

1. **Read-only on application code.** Create files under
   `REFRESH-PREP/findings/` only. Never edit `client/`, `server/`, or `ai-service/`.
2. **Do not create `REFRESH/`.** Only task 09 does that.
3. **Measure, don't guess.** Every claim needs a file path and line number, or a
   command whose output you paste. "Probably" is not a finding.
4. **Use `bun` / `bunx`, never `npm`** — it is not installed.
5. **Record uncertainty explicitly** rather than papering over it.
6. **Respect the locked decisions.** If you think one is wrong, note it under
   `## Open questions` and proceed as instructed anyway.
7. **Write structured Markdown** — tables and lists a downstream agent can
   mechanically turn into tasks. Prose paragraphs are hard to consume.
8. **Don't design someone else's layer.** Stay in your scope; note cross-cutting
   observations under `## Open questions` and let the owning audit handle them.
