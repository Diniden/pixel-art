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
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { act, render, screen } from "@testing-library/react";
import { runInAction } from "mobx";

import { tinyProject } from "@/store/__tests__/storeContract";
import { ApplicationStore } from "@/stores/ApplicationStore";
import { StoreProvider } from "@/stores/context";
import { AppContainer } from "@/containers/AppContainer";

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

  it("the header stands over the brush: 'Brushes' button, 'No brush' title, brush modal", async () => {
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
    expect(switcher!.textContent).toBe("Brushes");
    expect(screen.queryByText("Projects")).toBeNull();

    // No brush on disk → the title says so (and the export guard still reads
    // the PROJECT name, which is what `projectName` remains).
    expect(container.querySelector(".header__project-name")!.textContent).toBe(
      "No brush",
    );

    // The button opens the BRUSH chooser, not the project one. The modal
    // primitive portals to `document.body`, so query the document.
    act(() => switcher!.click());
    expect(document.querySelector(".brush-select-modal")).not.toBeNull();
    expect(document.querySelector(".project-select-modal")).toBeNull();
  });
});
