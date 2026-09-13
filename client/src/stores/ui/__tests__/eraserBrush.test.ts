/**
 * The eraser's own size and max (plan 09, task 09).
 *
 * ## The defect this closes
 *
 * The user reported that "the pencil and eraser have too many settings
 * interlaced … they need to be distinct values from each other." Shape
 * already WAS separate — `eraserShape` and `pencilBrushShape` are distinct
 * fields — but size and max were not: `brushSize` was a single global read by
 * seven consumers, and `pencilBrushMax`, named for the pencil, bounded the
 * eraser's slider too. `eraserBrushSize` and `eraserBrushMax` end that.
 *
 * ## ⚠️ THE INVARIANT THAT PROTECTS THE OWNER'S DATA
 *
 * Both new fields are TRI-STATE, exactly like `fillColor`, `eyedropperMode`,
 * `borderRadius` and `gaussianFill`: `undefined` means "absent from the
 * project file", and they are emitted through `assign()`, which writes
 * nothing for `undefined`. `UIStore.ts:539-547` states the rule this follows
 * and why it must not be weakened —
 *
 *   "neither key is emitted until the user changes something … The corpus
 *   digests are unchanged BECAUSE of that, not by luck — making either
 *   unconditional would add two keys to every project the moment it is next
 *   saved."
 *
 * There are 151 of the owner's real project snapshots. Making either key
 * unconditional would silently rewrite every one of them on its next save,
 * and the corpus suite is the only thing that catches it. **The
 * emits-neither-key case below is the single most important test in this
 * file** — if it ever fails, a key has been made unconditional and the fix is
 * to revert it, never to update a snapshot.
 *
 * ## And the fallback IS the migration
 *
 * There is no migration code and none is needed. `brushSize` keeps its slot,
 * its unconditional emission and its name, and now means specifically THE
 * PENCIL'S size. An existing project's single saved `brushSize` therefore
 * becomes the pencil's, and the eraser inherits the same number through
 * `effectiveEraserSize` until the user actually moves the eraser's slider.
 *
 * Conventions follow the sibling suite `fillColor.test.ts`, which already
 * pins a tri-state field.
 */
import { describe, expect, it } from "vitest";
import { runInAction } from "mobx";

import { LayoutUIStore } from "@/stores/ui/LayoutUIStore";
import { SelectionMirror } from "@/stores/SelectionMirror";
import { SessionStore } from "@/stores/session/SessionStore";
import { ToolUIStore } from "@/stores/ui/ToolUIStore";
import { UIStore } from "@/stores/ui/UIStore";

function store(): ToolUIStore {
  return new ToolUIStore();
}

/**
 * A `UIStore` whose tool store nothing has touched — the wire-format half.
 * The device class is pinned to "desktop" for the same reason
 * `persistedUIState.test.ts` pins it: jsdom would otherwise answer from the
 * environment.
 */
function uiStore(): UIStore {
  return new UIStore({
    session: new SessionStore(),
    selection: new SelectionMirror(),
    layout: new LayoutUIStore("desktop"),
  });
}

describe("eraserBrushSize / eraserBrushMax — the tri-state fields", () => {
  it("⭐ both default to undefined — no key for untouched projects", () => {
    const t = store();

    expect(t.eraserBrushSize).toBeUndefined();
    expect(t.eraserBrushMax).toBeUndefined();
  });

  it("⭐⭐ an untouched store emits NEITHER key — the corpus-safety invariant", () => {
    // THE test of this file. See the header: making either key unconditional
    // adds it to all 151 of the owner's real snapshots on their next save,
    // and this is what stands between that and the owner's data.
    const persisted = uiStore().toPersistedUIState();

    // `in`, not a truthiness or undefined check: "present but undefined"
    // still counts as a key to `Object.keys()` and to the corpus digest —
    // measured while adding `fillColor`, where it changed all 11 digests.
    expect("eraserBrushSize" in persisted).toBe(false);
    expect("eraserBrushMax" in persisted).toBe(false);

    // ...while `brushSize`, part of the frozen key set, is emitted
    // unconditionally as it always was and keeps its slot.
    expect("brushSize" in persisted).toBe(true);
  });

  it("⭐ after setEraserBrushSize, only THAT key appears", () => {
    const ui = uiStore();
    runInAction(() => ui.tool.setEraserBrushSize(8));

    const persisted = ui.toPersistedUIState();
    expect(persisted.eraserBrushSize).toBe(8);
    // The max is a separate user decision and must still be absent — the two
    // keys are independently conditional, not a pair that arrives together.
    expect("eraserBrushMax" in persisted).toBe(false);
  });

  it("setBrushSize alone never writes either key", () => {
    // The subtle half of the invariant: it is not enough that the fields
    // start `undefined`, nothing may write them INCIDENTALLY. Moving the
    // pencil's slider is the most likely path by which that could happen.
    const ui = uiStore();
    runInAction(() => ui.tool.setBrushSize(12));

    const persisted = ui.toPersistedUIState();
    expect("eraserBrushSize" in persisted).toBe(false);
    expect("eraserBrushMax" in persisted).toBe(false);
  });
});

describe("effectiveEraserSize — the ?? brushSize fallback that IS the migration", () => {
  it("⭐ falls back to brushSize while unset — a pre-split project is unchanged", () => {
    const t = store();
    runInAction(() => t.setBrushSize(12));

    expect(t.eraserBrushSize).toBeUndefined();
    // The eraser inherits the one saved size, which is exactly how the app
    // behaved before the split.
    expect(t.effectiveEraserSize).toBe(12);
  });

  it("returns its own value once set", () => {
    const t = store();
    runInAction(() => t.setBrushSize(12));
    runInAction(() => t.setEraserBrushSize(3));

    expect(t.effectiveEraserSize).toBe(3);
  });

  it("⭐ stops following brushSize once the eraser's size is set", () => {
    // The user's actual complaint, as a test: the two must no longer track
    // each other.
    const t = store();
    runInAction(() => t.setBrushSize(12));
    runInAction(() => t.setEraserBrushSize(3));

    runInAction(() => t.setBrushSize(20));

    expect(t.effectiveEraserSize).toBe(3);
    expect(t.brushSize).toBe(20);
  });

  it("and the pencil's size is untouched by the eraser's", () => {
    const t = store();
    runInAction(() => t.setBrushSize(12));
    runInAction(() => t.setEraserBrushSize(3));

    expect(t.brushSize).toBe(12);
  });
});

describe("effectiveEraserMax — the pencil's max, then 16", () => {
  it("falls back to pencilBrushMax while unset", () => {
    const t = store();
    runInAction(() => t.setPencilBrushMax(64));

    expect(t.eraserBrushMax).toBeUndefined();
    // Precisely the bound the eraser's slider used before this task.
    expect(t.effectiveEraserMax).toBe(64);
  });

  it("returns its own value once set", () => {
    const t = store();
    runInAction(() => t.setPencilBrushMax(64));
    runInAction(() => t.setEraserBrushMax(8));

    expect(t.effectiveEraserMax).toBe(8);
    expect(t.pencilBrushMax).toBe(64);
  });
});

describe("setEraserBrushMax — the re-clamp, mirroring setPencilBrushMax", () => {
  it("⭐ clamps the ERASER's size and leaves brushSize alone", () => {
    const t = store();
    runInAction(() => t.setBrushSize(32));
    runInAction(() => t.setEraserBrushSize(32));

    runInAction(() => t.setEraserBrushMax(8));

    expect(t.eraserBrushSize).toBe(8);
    // Clamping `brushSize` here would re-introduce exactly the interlacing
    // this task removes: lowering the eraser's max would shrink the pencil.
    expect(t.brushSize).toBe(32);
  });

  it("clamps through the fallback when the eraser's size was never set", () => {
    const t = store();
    runInAction(() => t.setBrushSize(32));

    runInAction(() => t.setEraserBrushMax(8));

    // Materialising the key here is user-initiated and therefore fine — and
    // it is necessary, or the eraser would keep inheriting an out-of-range 32.
    expect(t.effectiveEraserSize).toBe(8);
    expect(t.brushSize).toBe(32);
  });

  it("the pencil's own max still clamps the pencil, not the eraser", () => {
    const t = store();
    runInAction(() => t.setBrushSize(32));
    runInAction(() => t.setEraserBrushSize(32));

    runInAction(() => t.setPencilBrushMax(8));

    expect(t.brushSize).toBe(8);
    expect(t.eraserBrushSize).toBe(32);
  });
});

describe("activeToolBrushSize — the size the ACTIVE tool draws with", () => {
  it("is the eraser's size on the eraser", () => {
    const t = store();
    runInAction(() => t.setBrushSize(12));
    runInAction(() => t.setEraserBrushSize(3));

    runInAction(() => t.setTool("eraser"));
    expect(t.activeToolBrushSize).toBe(3);
  });

  it("is brushSize on the pencil", () => {
    const t = store();
    runInAction(() => t.setBrushSize(12));
    runInAction(() => t.setEraserBrushSize(3));

    runInAction(() => t.setTool("pixel"));
    expect(t.activeToolBrushSize).toBe(12);
  });

  it("⭐ is brushSize on fill-square too — only the eraser branches", () => {
    // Deliberate: the user asked to separate the pencil and the eraser, not
    // to give every tool its own size. `fill-square` and the reference-trace
    // brush keep reading the pencil's size, so no further wire keys are
    // needed.
    const t = store();
    runInAction(() => t.setBrushSize(12));
    runInAction(() => t.setEraserBrushSize(3));

    runInAction(() => t.setTool("fill-square"));
    expect(t.activeToolBrushSize).toBe(12);
  });
});

describe("hydrate — a round trip preserves both, and absent stays absent", () => {
  it("⭐ round-trips both fields", () => {
    const t = store();
    runInAction(() => t.hydrate({ eraserBrushSize: 3, eraserBrushMax: 8 }));

    expect(t.eraserBrushSize).toBe(3);
    expect(t.eraserBrushMax).toBe(8);
    expect(t.effectiveEraserSize).toBe(3);
    expect(t.effectiveEraserMax).toBe(8);
  });

  it("survives a full store round trip through the wire builder", () => {
    const ui = uiStore();
    runInAction(() => {
      ui.tool.setBrushSize(12);
      ui.tool.setEraserBrushSize(3);
      ui.tool.setEraserBrushMax(8);
    });
    const persisted = ui.toPersistedUIState();

    const next = store();
    runInAction(() =>
      next.hydrate({
        brushSize: persisted.brushSize,
        eraserBrushSize: persisted.eraserBrushSize,
        eraserBrushMax: persisted.eraserBrushMax,
      }),
    );

    expect(next.brushSize).toBe(12);
    expect(next.eraserBrushSize).toBe(3);
    expect(next.eraserBrushMax).toBe(8);
  });

  it("⭐ hydrating a project WITHOUT the keys leaves them undefined", () => {
    const t = store();
    runInAction(() => t.hydrate({ brushSize: 12 }));

    // Not 12 — the fields stay ABSENT, so re-saving the project does not gain
    // a key. The fallback is what makes the eraser read as 12.
    expect(t.eraserBrushSize).toBeUndefined();
    expect(t.eraserBrushMax).toBeUndefined();
    expect(t.effectiveEraserSize).toBe(12);
  });

  it("⭐ absent CLEARS a previously-set value — a project switch cannot leak", () => {
    // The reason `hydrate` assigns these unconditionally. If it skipped
    // `undefined`, opening a project that has no eraser key after one that
    // does would let the first project's size persist, and the next save
    // would write that borrowed number into a file that never had the key.
    const t = store();
    runInAction(() => t.setEraserBrushSize(3));
    expect(t.eraserBrushSize).toBe(3);

    runInAction(() => t.hydrate({ brushSize: 12 }));

    expect(t.eraserBrushSize).toBeUndefined();
    expect(t.effectiveEraserSize).toBe(12);
  });
});
