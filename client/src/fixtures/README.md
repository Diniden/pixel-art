# `src/fixtures/` — shared sample data for stories AND tests

Plain-object sample data typed against `src/types`. **Shared**, not duplicated:
stories and Vitest must describe the _same_ data or the visual evidence and the
unit evidence are about different things. The variant-offset 4-level fallback,
`screenToPixel`'s snapping modes and the brush mouse-vs-touch agreement tests all
need the same shapes the stories render.

## Rules

- **No MobX, no store, no API import.** Task 10's verification greps this
  directory for the MobX and store identifiers. Note that grep matches comments
  too, so neither this file nor any source file here spells those identifiers
  out — a hit must mean real code, or the check is theatre.
- **Never use the owner's real project file** (`server/src/data/`). It is 1.1 MB
  and 300,249 pixel cells of real work; it belongs to the migration corpus
  (task 07), not to stories. A fixture you cannot read in one screen is not a
  fixture.
- **Deterministic.** No `Date.now()`, no `Math.random()`, no `generateId()`.
  IDs are literal and stable so snapshots do not churn.
- **Builders are pure.** Every `make*` helper returns a fresh deep structure, so
  a test that mutates a fixture cannot leak into the next test. Prefer calling a
  builder over mutating an exported constant.

## The three sizes

| Export           | Shape                                                                                  | Use                            |
| ---------------- | -------------------------------------------------------------------------------------- | ------------------------------ |
| `projectEmpty`   | 0 objects                                                                              | empty-state stories            |
| `projectTypical` | 2 objects, 4 frames, 3 layers, 16x16, 1 variant group with 2 variants, some frame tags | the default story fixture      |
| `projectDense`   | 12 objects x 12 frames x 8 layers                                                      | stress + virtualisation checks |

`projectDense` is built once at module load via the memoised `getProjectDense()`
and exported as a plain constant. Measured (task 10, Bun 1.3.5): building all
294,912 cells takes **26.8 ms**, which does not justify a lazy `Proxy` whose
`ownKeys` invariants and `JSON.stringify` behaviour differ from a real object.

The exported `projectEmpty` / `projectTypical` / `projectDense` constants are
**shared instances — treat them as read-only.** Call `makeProjectEmpty()`,
`makeProjectTypical()` or `makeProjectDense()` for a copy you intend to mutate.
