/**
 * `X` swaps the edge and fill colours (plan 09, task 11).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THIS PINS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The iPad reaches the swap by tapping the picker's button; `X` is the
 * desktop convenience, and it is the paint-application convention (Photoshop,
 * Krita, Aseprite, GIMP). `GlobalHotkeys` had no test before this file.
 *
 * ⚠️ THE TYPING GUARD IS THE POINT, not the swap. A shortcut that swaps while
 * the caret is in the colour picker's hex field or a layer-rename box is a
 * bug — the user typed a character and the app repainted their palette. The
 * three suppression cases below are the ones that discriminate; the plain
 * "pressing X swaps" case would pass against an unguarded binding too.
 *
 * ⚠️ AND THE ESCAPE ASYMMETRY IS DELIBERATE AND MUST NOT BE "TIDIED". Escape
 * clears `colorAdjustment` even while a text field has focus — the legacy
 * contract, transcribed from `App.tsx` and documented in the container's
 * header. A case below pins it, so hoisting the guard above the Escape branch
 * fails here rather than silently changing behaviour.
 *
 * The harness is an `ApplicationStore` with no Zustand attached, transcribed
 * from `PaletteManagerContainer.dom.test.tsx`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { runInAction } from "mobx";

import type { Project } from "@/types";
import { ApplicationStore } from "@/stores/ApplicationStore";
import { StoreProvider } from "@/stores/context";
import { GlobalHotkeys } from "@/containers/GlobalHotkeys";
import type { DomainMirror } from "@/stores/domain/DomainMutator";
import type { ProjectHost } from "@/stores/domain/DomainStore";
import type { SelectionSink } from "@/stores/domain/ObjectStore";
import { BLUE, RED, tinyProject } from "@/store/__tests__/storeContract";

function makeApp(): ApplicationStore {
  const project: Project = tinyProject();
  let current: Project | null = project;
  const host: ProjectHost = {
    getProject: () => current,
    installProject: (p) => {
      current = p;
    },
    replaceProject: (p) => {
      current = p;
    },
    snapshotToHistory: () => {},
  };
  const mirror: DomainMirror = {
    publish: (p) => {
      current = p;
    },
    snapshot: () => {},
  };
  const selectionSink: SelectionSink = {
    selectObjectTree: (ids) => {
      if (!current) return;
      current = { ...current, uiState: { ...current.uiState, ...ids } };
    },
  };
  const app = new ApplicationStore({
    autoSaveEnabled: false,
    projectHost: host,
    domainMirror: mirror,
    selectionSink,
  });
  runInAction(() => app.domain.adoptTree(project));
  return app;
}

/** Mount the headless container with the two colour slots seeded distinctly. */
function mount(): ApplicationStore {
  const app = makeApp();
  render(
    <StoreProvider store={app}>
      <GlobalHotkeys />
    </StoreProvider>,
  );
  act(() =>
    runInAction(() => {
      app.ui.tool.setColor(RED);
      app.ui.tool.setFillColor(BLUE);
    }),
  );
  return app;
}

/**
 * Dispatch a real `keydown` on `window` with a chosen target.
 *
 * ⚠️ The container listens on `window`, and the guard reads `e.target`. A
 * `fireEvent.keyDown(window, …)` cannot set a target that is a real element,
 * so the event is dispatched from the element and allowed to bubble — which
 * is also exactly how a keystroke in a focused field reaches this handler.
 */
function press(
  key: string,
  target: Element | Window = window,
  modifiers: KeyboardEventInit = {},
) {
  const e = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  act(() => {
    target.dispatchEvent(e);
  });
  return e;
}

const created: HTMLElement[] = [];

/**
 * An element attached to the document, so its events bubble to `window`.
 *
 * ⚠️ jsdom implements NEITHER the `contentEditable` setter NOR the
 * `isContentEditable` getter — measured: setting `el.contentEditable = "true"`
 * leaves the attribute `null` and `el.isContentEditable` `undefined`. The
 * guard reads `isContentEditable`, so without the stub below the
 * contenteditable case tests jsdom's gap rather than the app's guard, and it
 * FAILS against correct code (measured: the swap went through). The property
 * is defined directly, which is what a real browser would report.
 */
function field(tag: "input" | "textarea" | "div"): HTMLElement {
  const el = document.createElement(tag);
  if (tag === "div") {
    el.setAttribute("contenteditable", "true");
    Object.defineProperty(el, "isContentEditable", { value: true });
  }
  document.body.appendChild(el);
  created.push(el);
  return el;
}

afterEach(() => {
  for (const el of created.splice(0)) el.remove();
});

describe("GlobalHotkeys — X swaps edge and fill", () => {
  it("⭐ pressing X exchanges the two slots", () => {
    const app = mount();
    press("x");
    expect(app.ui.tool.selectedColor).toEqual(BLUE);
    expect(app.ui.tool.fillColor).toEqual(RED);
  });

  it("a capital X swaps too — Caps Lock and a held Shift both work", () => {
    // Matching how `TOOL_HOTKEYS` lists `g`/`G` and `r`/`R` in both cases:
    // the lookup there is by raw `e.key`, which is case-sensitive.
    const app = mount();
    press("X", window, { shiftKey: true });
    expect(app.ui.tool.selectedColor).toEqual(BLUE);
  });

  it("⭐ takes exactly ONE history snapshot — one swap, one undo", () => {
    const app = mount();
    const saveStateToHistory = vi.spyOn(app, "saveStateToHistory");
    press("x");
    // `swapEdgeAndFillColors` snapshots once on its own. A binding that
    // bracketed it with a second save would make one swap cost two undos.
    expect(saveStateToHistory).toHaveBeenCalledTimes(1);
  });

  it("delegates to swapEdgeAndFillColors rather than writing both slots", () => {
    const app = makeApp();
    const swap = vi.spyOn(app, "swapEdgeAndFillColors");
    render(
      <StoreProvider store={app}>
        <GlobalHotkeys />
      </StoreProvider>,
    );
    press("x");
    expect(swap).toHaveBeenCalledTimes(1);
  });

  it("preventDefault()s, so the key does not also reach the page", () => {
    mount();
    const e = press("x");
    expect(e.defaultPrevented).toBe(true);
  });
});

describe("⭐⭐ GlobalHotkeys — X is suppressed while a text field has focus", () => {
  /* The cases that actually discriminate. An unguarded binding passes every
     test in the group above and fails all three of these. */

  it("does NOT swap while typing in an <input> — the hex field", () => {
    const app = mount();
    press("x", field("input"));
    expect(app.ui.tool.selectedColor).toEqual(RED);
    expect(app.ui.tool.fillColor).toEqual(BLUE);
  });

  it("does NOT swap while typing in a <textarea>", () => {
    const app = mount();
    press("x", field("textarea"));
    expect(app.ui.tool.selectedColor).toEqual(RED);
  });

  it("does NOT swap inside a contenteditable — a layer-rename box", () => {
    const app = mount();
    press("x", field("div"));
    expect(app.ui.tool.selectedColor).toEqual(RED);
  });

  it("does not preventDefault inside a field — the character must be typed", () => {
    mount();
    const e = press("x", field("input"));
    expect(e.defaultPrevented).toBe(false);
  });
});

describe("GlobalHotkeys — X does not steal a modified keystroke", () => {
  it("Cmd+X still cuts", () => {
    const app = mount();
    press("x", window, { metaKey: true });
    expect(app.ui.tool.selectedColor).toEqual(RED);
  });

  it("Ctrl+X still cuts", () => {
    const app = mount();
    press("x", window, { ctrlKey: true });
    expect(app.ui.tool.selectedColor).toEqual(RED);
  });

  it("Alt+X reaches the browser", () => {
    const app = mount();
    press("x", window, { altKey: true });
    expect(app.ui.tool.selectedColor).toEqual(RED);
  });
});

describe("GlobalHotkeys — the Escape asymmetry is preserved", () => {
  /**
   * ⚠️ NOT a new behaviour and NOT this task's — it is the legacy contract
   * transcribed from `App.tsx` and explained in the container's header, and
   * it is pinned here because task 11 added a THIRD user of the typing guard.
   * The tempting tidy-up is to hoist that guard above every branch, which
   * would silently take this away.
   */
  it("Escape clears colorAdjustment EVEN while a text field has focus", () => {
    const app = mount();
    act(() =>
      runInAction(() =>
        // The minimal complete `ColorAdjustmentState`. The Escape branch only
        // tests it for truthiness, so an empty `affectedPixels` is enough —
        // but the field is required and the gate's typecheck says so.
        app.ui.tool.setColorAdjustment({
          originalColor: RED,
          allFrames: false,
          affectedPixels: [],
        }),
      ),
    );
    expect(app.ui.tool.colorAdjustment).not.toBeNull();

    press("Escape", field("input"));

    expect(app.ui.tool.colorAdjustment).toBeNull();
  });
});
