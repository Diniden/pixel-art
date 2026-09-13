/**
 * The swap control is wired, and the hex field reaches the store (plan 09,
 * task 11 — this closes R8).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THIS PINS, AND WHY IT MOUNTS THE REAL COMPONENT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Task 07 added the swap button to `ui/components/ColorPicker/ColorPicker.tsx`
 * behind an OPTIONAL `onSwapColors` prop — the control renders only when a
 * caller supplies it — because `ColorPickerContainer.tsx` belonged to task 06
 * in the same wave. Nothing supplied it, so the desktop picker showed **no
 * swap button at all** and task 07's manual check 6 could not pass. That is
 * the plan's R8.
 *
 * ⚠️ SO THE SUBJECT HERE IS A RENDERED BUTTON, NOT A PROP, and that is why
 * this file does NOT stub `ColorPicker` the way `PaletteManagerContainer`'s
 * suite stubs `PaletteManager`. A prop recorder would happily record
 * `onSwapColors` as a function while the real component rendered nothing —
 * the exact failure R8 describes. The button has to be found in the DOM and
 * clicked for this to be evidence.
 *
 * The other half of the pair — that the component renders the control only
 * when the prop arrives, and not otherwise — is pinned component-side in
 * `ui/components/ColorPicker/__tests__/ColorPicker.dom.test.tsx`.
 *
 * ── The store assertions, and the one that is a characterisation ──────────
 *
 * `swapEdgeAndFillColors` (task 05) snapshots ONCE, swaps, then runs
 * `colorSink`. The undo behaviour of that snapshot is NOT asserted here as
 * desired behaviour: task 07 measured and pinned a pre-existing defect where
 * one undo restores `selectedColor` but leaves `fillColor` where the swap put
 * it, because `fillColor` is MobX-only with no sink. That characterisation
 * lives in `OtherHandRailContainer.dom.test.tsx:205` and is not duplicated.
 * What is asserted here is that exactly one snapshot is taken — the container
 * must not bracket the call with a second `saveStateToHistory`.
 *
 * ⚠️ jsdom implements neither `setPointerCapture` nor a canvas 2D context,
 * and gives every element a 0×0 rect. The real `ColorPicker` mounts through
 * all three (its draw calls bail on a null context), so only `getContext` is
 * stubbed — the SV drag is not exercised here, it has its own suite.
 *
 * The harness is transcribed from `PaletteManagerContainer.dom.test.tsx`,
 * itself from `stores/ui/__tests__/colorTarget.test.ts`: an `ApplicationStore`
 * with no Zustand attached.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { runInAction } from "mobx";

import type { Project } from "@/types";
import { ApplicationStore } from "@/stores/ApplicationStore";
import { StoreProvider } from "@/stores/context";
import { ColorPickerContainer } from "@/containers/ColorPickerContainer";
import type { DomainMirror } from "@/stores/domain/DomainMutator";
import type { ProjectHost } from "@/stores/domain/DomainStore";
import type { SelectionSink } from "@/stores/domain/ObjectStore";
import { BLUE, RED, tinyProject } from "@/store/__tests__/storeContract";

/** See the header: the component bails on a null 2D context, but exercise it. */
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () =>
      ({
        fillRect: vi.fn(),
        createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
        set fillStyle(_v: unknown) {},
      }) as unknown as CanvasRenderingContext2D,
  ) as unknown as HTMLCanvasElement["getContext"];
});

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

function mount(): { app: ApplicationStore; container: HTMLElement } {
  const app = makeApp();
  const { container } = render(
    <StoreProvider store={app}>
      <ColorPickerContainer />
    </StoreProvider>,
  );
  // The container returns null without a project; if this fires, the fixture
  // is wrong and every assertion below would be vacuous.
  expect(container.querySelector(".color-picker")).not.toBeNull();
  return { app, container };
}

function swapButton(container: HTMLElement): HTMLButtonElement | null {
  return container.querySelector(".color-picker__swap");
}

describe("ColorPickerContainer — the swap control (R8)", () => {
  it("⭐⭐ RENDERS a swap button — the whole of R8", () => {
    const { container } = mount();
    // Until task 11 passed `onSwapColors`, this was null: the button existed
    // in the component and the picker never asked for it.
    expect(swapButton(container)).not.toBeNull();
  });

  it("⭐ exchanges the edge and fill colours when clicked", () => {
    const { app, container } = mount();
    act(() =>
      runInAction(() => {
        app.ui.tool.setColor(RED);
        app.ui.tool.setFillColor(BLUE);
      }),
    );

    act(() => {
      fireEvent.click(swapButton(container)!);
    });

    expect(app.ui.tool.selectedColor).toEqual(BLUE);
    expect(app.ui.tool.fillColor).toEqual(RED);
  });

  it("swapping twice returns to where it started", () => {
    const { app, container } = mount();
    act(() =>
      runInAction(() => {
        app.ui.tool.setColor(RED);
        app.ui.tool.setFillColor(BLUE);
      }),
    );

    act(() => {
      fireEvent.click(swapButton(container)!);
      fireEvent.click(swapButton(container)!);
    });

    expect(app.ui.tool.selectedColor).toEqual(RED);
    expect(app.ui.tool.fillColor).toEqual(BLUE);
  });

  it("⭐ takes exactly ONE history snapshot per swap", () => {
    const { app, container } = mount();
    act(() =>
      runInAction(() => {
        app.ui.tool.setColor(RED);
        app.ui.tool.setFillColor(BLUE);
      }),
    );

    const saveStateToHistory = vi.spyOn(app, "saveStateToHistory");
    act(() => {
      fireEvent.click(swapButton(container)!);
    });

    // `swapEdgeAndFillColors` snapshots once on its own. If the container ever
    // brackets it with another `onSaveStateToHistory`, one swap costs two
    // undos and this is what catches it.
    expect(saveStateToHistory).toHaveBeenCalledTimes(1);
  });

  it("delegates to ApplicationStore.swapEdgeAndFillColors — one swap point", () => {
    const app = makeApp();
    const swap = vi.spyOn(app, "swapEdgeAndFillColors");
    const { container } = render(
      <StoreProvider store={app}>
        <ColorPickerContainer />
      </StoreProvider>,
    );

    act(() => {
      fireEvent.click(swapButton(container)!);
    });

    // The other-hand rail calls the same method. If a future edit re-inlines
    // the two writes here, the slot assertions above would still pass and this
    // is the only thing that would catch the second branch point appearing.
    expect(swap).toHaveBeenCalledTimes(1);
  });

  it("materialises fillColor, so a project predating the split gains both slots", () => {
    const { app, container } = mount();
    act(() => runInAction(() => app.ui.tool.setColor(RED)));
    // A project saved before the edge/fill split has no `fillColor` key.
    expect(app.ui.tool.fillColor).toBeUndefined();

    act(() => {
      fireEvent.click(swapButton(container)!);
    });

    // `fillColorOrSelected` was RED, so both slots are RED afterwards — but
    // `fillColor` is now DEFINED, which is what makes the two independently
    // editable from here on (locked decision, task 05).
    expect(app.ui.tool.fillColor).toEqual(RED);
    expect(app.ui.tool.selectedColor).toEqual(RED);
  });
});

describe("ColorPickerContainer — the hex field reaches the store on blur", () => {
  /**
   * The component-side semantics (draft, blur, Enter, Escape, invalid revert)
   * are pinned in `ColorPicker.dom.test.tsx`. What is pinned HERE is the one
   * thing that suite cannot see: that a committed hex actually lands in the
   * slot the colour target names, through `app.setActiveColor`.
   */
  function hexInput(container: HTMLElement): HTMLInputElement {
    return container.querySelector(
      ".color-picker__hex-input",
    ) as HTMLInputElement;
  }

  it("writes the EDGE slot on blur while the edge target is active", () => {
    const { app, container } = mount();
    const hex = hexInput(container);

    act(() => {
      fireEvent.change(hex, { target: { value: "#00ff00" } });
    });
    // Still nothing — the draft has not been committed.
    expect(app.ui.tool.selectedColor).not.toEqual({
      r: 0,
      g: 255,
      b: 0,
      a: 255,
    });

    act(() => {
      fireEvent.blur(hex);
    });
    expect(app.ui.tool.selectedColor).toEqual({ r: 0, g: 255, b: 0, a: 255 });
  });

  it("⭐ writes the FILL slot on blur while the fill target is active", () => {
    const { app, container } = mount();
    act(() =>
      runInAction(() => {
        app.ui.tool.setColor(RED);
        app.ui.tool.setColorTarget("fill");
      }),
    );

    const hex = hexInput(container);
    act(() => {
      fireEvent.change(hex, { target: { value: "#0000ff" } });
      fireEvent.blur(hex);
    });

    expect(app.ui.tool.fillColor).toEqual({ r: 0, g: 0, b: 255, a: 255 });
    // The whole point of the target: the edge slot is untouched.
    expect(app.ui.tool.selectedColor).toEqual(RED);
  });

  it("an invalid draft on blur writes neither slot", () => {
    const { app, container } = mount();
    act(() =>
      runInAction(() => {
        app.ui.tool.setColor(RED);
        app.ui.tool.setFillColor(BLUE);
      }),
    );

    const hex = hexInput(container);
    act(() => {
      fireEvent.change(hex, { target: { value: "#ab" } });
      fireEvent.blur(hex);
    });

    expect(app.ui.tool.selectedColor).toEqual(RED);
    expect(app.ui.tool.fillColor).toEqual(BLUE);
  });
});
