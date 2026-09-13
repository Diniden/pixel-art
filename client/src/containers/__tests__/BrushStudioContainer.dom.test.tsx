/**
 * BrushStudioContainer — the brush branch of `AppContainer` mounts the REAL
 * studio (brush-studio task 19).
 *
 * Executors have no browser, so this is the automatable slice of the task's
 * manual checks: with `studioMode: "brush"` the app root renders
 * `BrushStudioContainer` and every container it composes — header, toolbar,
 * brush library, layer panel, right controls, studio panel, timeline, canvas —
 * without throwing, and under React 19 StrictMode the mount effect's
 * double-fire produces ONE `GET /api/brushes` (manual check 8).
 *
 * The `dom` vitest lane runs without MSW (only `setup.dom.ts`), so `fetch` is
 * stubbed here: `/api/brushes` answers an empty list (the library's empty
 * state), everything else (the header's AI config/health polls) answers `{}`.
 * `setup.dom.ts` calls `vi.unstubAllGlobals()` after each test.
 *
 * jsdom has no canvas: `getContext("2d")` returns `null` and every painter
 * early-returns, so the canvas and thumbnails mount as empty elements. That is
 * fine — the branch and the composition are what is under test, not pixels.
 *
 * The second block (follow-ups task 09) installs a brush document directly
 * (`loadState: "loaded"` makes `init()` a no-op) and pins the canvas region's
 * pane model: one Full pane by default, `brushViews.openMode("layer")` adds a
 * Layer pane on the RIGHT, `swap()` reorders the SAME DOM nodes (no remount),
 * `closeMode("layer")` returns to one, each pane carrying its own controls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { act, render, screen } from "@testing-library/react";
import { runInAction } from "mobx";

import { tinyProject } from "@/store/__tests__/storeContract";
import { ApplicationStore } from "@/stores/ApplicationStore";
import { StoreProvider } from "@/stores/context";
import { AppContainer } from "@/containers/AppContainer";
import { createBrushDocument } from "@/types";

let app: ApplicationStore;
let consoleError: ReturnType<typeof vi.spyOn>;
let brushListCalls: number;

beforeEach(() => {
  brushListCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/api/brushes")) {
        brushListCalls += 1;
        return new Response(JSON.stringify({ brushes: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  app = new ApplicationStore({ autoSaveEnabled: false });
  runInAction(() => {
    app.adoptProject(tinyProject());
    app.domain.loadState = "loaded";
    app.lightingUI.setStudioMode("brush");
  });
});

afterEach(() => {
  app.dispose();
  consoleError.mockRestore();
});

/** Let the stubbed `GET /api/brushes` resolve and the store settle. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

describe("AppContainer in brush mode", () => {
  it("mounts BrushStudioContainer and its composed regions without throwing", async () => {
    const { container } = render(
      <StrictMode>
        <StoreProvider store={app}>
          <AppContainer />
        </StoreProvider>
      </StrictMode>,
    );
    await settle();

    // Not the loading screen, not the old task-03 placeholder.
    expect(container.querySelector(".app__loading")).toBeNull();
    expect(container.querySelector(".app__placeholder")).toBeNull();
    expect(screen.queryByText("Back to Pixel Studio")).toBeNull();

    // The brush studio's own regions — the ones the pixel studio does not
    // have — are on screen: the brush library (left rail) and the delta
    // picker's host panel (right rail). Their BEM blocks are the contract.
    expect(container.querySelector(".brush-library")).not.toBeNull();
    // Shared chrome is mounted too.
    expect(container.querySelector(".header")).not.toBeNull();
    expect(container.querySelector(".toolbar")).not.toBeNull();
  });

  it("calls brushes.init() once under StrictMode — one GET /api/brushes", async () => {
    render(
      <StrictMode>
        <StoreProvider store={app}>
          <AppContainer />
        </StoreProvider>
      </StrictMode>,
    );
    await settle();

    expect(brushListCalls).toBe(1);
    // An empty list leaves the store `idle` with no document (MASTER §1:
    // "otherwise an empty state until one is created").
    expect(runInAction(() => app.brushes.loadState)).toBe("idle");
    expect(runInAction(() => app.brushes.document)).toBeNull();
  });

  it("the header stands over the brush: 'Brush Projects' button, 'No brush project' title, brush modal", async () => {
    const { container } = render(
      <StoreProvider store={app}>
        <AppContainer />
      </StoreProvider>,
    );
    await settle();

    // MASTER D21: the switcher is relabelled, not replaced.
    const switcher = container.querySelector<HTMLButtonElement>(
      ".header__switch-btn",
    );
    expect(switcher).not.toBeNull();
    expect(switcher!.textContent).toBe("Brush Projects");
    expect(screen.queryByText("Projects")).toBeNull();

    // No brush on disk → the title says so (and the export guard still reads
    // the PROJECT name, which is what `projectName` remains).
    expect(container.querySelector(".header__project-name")!.textContent).toBe(
      "No brush project",
    );

    // The button opens the BRUSH chooser, not the project one. The modal
    // primitive portals to `document.body`, so query the document.
    act(() => switcher!.click());
    expect(document.querySelector(".brush-select-modal")).not.toBeNull();
    expect(document.querySelector(".project-select-modal")).toBeNull();
  });
});

describe("the canvas region: Full and Layer panes (follow-ups task 09)", () => {
  /** A 4×4 brush installed straight into the store — no fetch, no init load. */
  function installBrush(): void {
    runInAction(() => {
      app.brushes.brushName = "test-brush";
      app.brushes.installDocument(createBrushDocument(4, 4));
      app.brushes.loadState = "loaded";
    });
  }

  const paneKeys = (root: HTMLElement) =>
    Array.from(root.querySelectorAll(".canvas-split__pane")).map((el) =>
      el.getAttribute("data-pane"),
    );
  const canvasRoots = (root: HTMLElement) =>
    Array.from(root.querySelectorAll<HTMLElement>(".canvas"));
  const paneButton = (pane: Element, label: string) =>
    pane.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

  it("⭐ one Full pane by default, with 'Open Layer view' and no close button", async () => {
    installBrush();
    const { container } = render(
      <StoreProvider store={app}>
        <AppContainer />
      </StoreProvider>,
    );
    await settle();

    expect(container.querySelector(".canvas-split")).not.toBeNull();
    expect(container.querySelector(".canvas-split--dual")).toBeNull();
    expect(paneKeys(container)).toEqual(["full"]);
    expect(canvasRoots(container)).toHaveLength(1);

    const pane = container.querySelector(".canvas-split__pane")!;
    expect(paneButton(pane, "Open Layer view")).not.toBeNull();
    expect(paneButton(pane, "Swap pane sides")).toBeNull();
    expect(paneButton(pane, "Close Full view")).toBeNull();
    expect(
      paneButton(pane, "Center the workspace and return to 100% zoom"),
    ).not.toBeNull();
  });

  it("⭐ openMode('layer') adds a Layer pane on the RIGHT; swap() reorders WITHOUT remounting; closeMode('layer') returns to one", async () => {
    installBrush();
    const { container } = render(
      <StoreProvider store={app}>
        <AppContainer />
      </StoreProvider>,
    );
    await settle();
    const [fullCanvas] = canvasRoots(container);

    // The button in the Full pane does what the store action does.
    act(() => {
      paneButton(
        container.querySelector(".canvas-split__pane")!,
        "Open Layer view",
      )!.click();
    });
    expect(container.querySelector(".canvas-split--dual")).not.toBeNull();
    expect(paneKeys(container)).toEqual(["full", "layer"]);
    const twoRoots = canvasRoots(container);
    expect(twoRoots).toHaveLength(2);
    // The Full pane's subtree survived the split — same node, not a remount.
    expect(twoRoots[0]).toBe(fullCanvas);
    const layerCanvas = twoRoots[1];

    // Both panes now offer swap + close, each closing ITSELF.
    const [leftPane, rightPane] = Array.from(
      container.querySelectorAll(".canvas-split__pane"),
    );
    expect(paneButton(leftPane, "Swap pane sides")).not.toBeNull();
    expect(paneButton(leftPane, "Close Full view")).not.toBeNull();
    expect(paneButton(rightPane, "Swap pane sides")).not.toBeNull();
    expect(paneButton(rightPane, "Close Layer view")).not.toBeNull();
    expect(paneButton(rightPane, "Open Full view")).toBeNull();

    // Swap: the SAME two DOM nodes, in the other order.
    act(() => paneButton(rightPane, "Swap pane sides")!.click());
    expect(paneKeys(container)).toEqual(["layer", "full"]);
    const swapped = canvasRoots(container);
    expect(swapped[0]).toBe(layerCanvas);
    expect(swapped[1]).toBe(fullCanvas);
    expect(fullCanvas.isConnected).toBe(true);
    expect(layerCanvas.isConnected).toBe(true);

    // Close the Layer pane: back to one Full pane, still the same node.
    act(() => app.brushViews.closeMode("layer"));
    expect(paneKeys(container)).toEqual(["full"]);
    expect(canvasRoots(container)).toEqual([fullCanvas]);
    expect(layerCanvas.isConnected).toBe(false);
    expect(container.querySelector(".canvas-split--dual")).toBeNull();
  });

  it("the Layer pane drives brushViews.layerCamera; the Full pane drives brushUI", async () => {
    installBrush();
    const { container } = render(
      <StoreProvider store={app}>
        <AppContainer />
      </StoreProvider>,
    );
    await settle();
    act(() => app.brushViews.openMode("layer"));
    runInAction(() => {
      app.brushUI.setPanOffset({ x: 30, y: 40 });
      app.brushViews.layerCamera.setPanOffset({ x: -5, y: -6 });
    });

    // Reset View in the LAYER pane touches only the layer camera.
    const [, layerPane] = Array.from(
      container.querySelectorAll(".canvas-split__pane"),
    );
    act(() =>
      paneButton(
        layerPane,
        "Center the workspace and return to 100% zoom",
      )!.click(),
    );
    const pans = runInAction(() => ({
      full: app.brushUI.panOffset,
      layer: app.brushViews.layerCamera.panOffset,
    }));
    expect(pans.full).toEqual({ x: 30, y: 40 });
    expect(pans.layer).not.toEqual({ x: -5, y: -6 });
  });
});
