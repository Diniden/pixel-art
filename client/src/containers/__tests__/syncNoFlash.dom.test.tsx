/**
 * THE NO-FLASH PROOF — rendered, not reasoned about.
 *
 * ⚠️ The studio children are STUBBED. Rendering the real editor here would
 * pull in the canvas tree, and jsdom has no canvas (`getContext("2d")` returns
 * `null`) — the test would fail on `createImageData` for reasons that have
 * nothing to do with flashing. What decides the flash is `AppContainer`'s
 * load-state BRANCH: whether it returns `<LoadingLayout />` or its children.
 * Stubbing the children isolates exactly that branch and lets the mounted-node
 * identity check mean something.
 *
 * `syncController.test.ts` asserts that `loadState` never leaves `"loaded"`
 * during a sync refresh. That is the right signal, but it is a proxy for the
 * thing the user actually reported: the whole screen flashing.
 *
 * This file closes that gap by mounting the REAL `AppContainer` and watching
 * the DOM across a refresh. `AppContainer` swaps the entire editor for
 * `<LoadingLayout />` (`.app__loading`) whenever `loadState !== "loaded"`, so
 * "did it flash?" becomes an observable DOM question:
 *
 *   - does `.app__loading` ever appear after the first paint?
 *   - is the editor's DOM node the SAME node afterwards, i.e. was it patched
 *     in place rather than unmounted and rebuilt?
 *
 * A MutationObserver is not needed: React commits synchronously inside
 * `act()`, so sampling around the awaited refresh catches a remount.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { observer } from "mobx-react-lite";
import { runInAction } from "mobx";
import { useStores } from "@/stores/context";

import { tinyProject } from "@/store/__tests__/storeContract";
// Stub the studio children: jsdom has no canvas, and the branch is what matters.
vi.mock("@/containers/PixelStudioContainer", () => ({
  // Reads the store so a swapped tree is observable in the DOM.
  PixelStudioContainer: observer(function StubEditor() {
    const { domain } = useStores();
    return <div data-testid="editor">{domain.objects[0]?.name ?? "none"}</div>;
  }),
}));
vi.mock("@/containers/LightingStudioContainer", () => ({
  LightingStudioContainer: () => <div data-testid="editor">lighting</div>,
}));
vi.mock("@/containers/GlobalHotkeys", () => ({
  GlobalHotkeys: () => null,
}));
import { ApplicationStore } from "@/stores/ApplicationStore";
import { StoreProvider } from "@/stores/context";
import { AppContainer } from "@/containers/AppContainer";
import { SyncController } from "@/stores/session/SyncController";
import type { Project } from "@/types";

let app: ApplicationStore;
let consoleError: ReturnType<typeof vi.spyOn>;

/**
 * Put the app in the loaded state WITHOUT the network.
 *
 * The `dom` vitest lane deliberately runs without MSW (only `setup.dom.ts`),
 * so this test drives the stores directly rather than over HTTP. What is under
 * test here is the RENDER behaviour of a refresh, not its transport — the
 * transport is covered in `stores/session/__tests__/syncController.test.ts`.
 */
function mountLoaded(): void {
  runInAction(() => {
    app.adoptProject(tinyProject());
    app.domain.loadState = "loaded";
  });
}

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  app = new ApplicationStore({ autoSaveEnabled: false });
  mountLoaded();
});

afterEach(() => {
  app.dispose();
  consoleError.mockRestore();
});

describe("a sync refresh does not flash the screen", () => {
  it("never shows the loading screen, and keeps the SAME editor DOM node", async () => {
    const { container } = render(
      <StoreProvider store={app}>
        <AppContainer />
      </StoreProvider>,
    );

    // Baseline: the editor is up and the loading screen is gone.
    expect(container.querySelector(".app__loading")).toBeNull();
    const editorBefore = screen.getByTestId("editor");
    expect(editorBefore).not.toBeNull();

    // Watch for the loading screen at every commit during the refresh.
    let sawLoadingScreen = false;
    const checkForFlash = () => {
      if (container.querySelector(".app__loading")) sawLoadingScreen = true;
    };
    const interval = setInterval(checkForFlash, 1);

    // The injected reload stands in for the network fetch and then does what
    // `refreshFromServer` does: swap the tree WITHOUT touching `loadState`.
    const sync = new SyncController(app.domain, app.session, {
      reload: async () => {
        await Promise.resolve();
        runInAction(() => app.adoptProject(tinyProject()));
      },
    });
    await act(async () => {
      sync.handleProjectSaved({
        type: "project-saved",
        projectName: app.domain.projectName,
        origin: "peer",
        at: Date.now(),
      });
      await new Promise((r) => setTimeout(r, 200));
    });

    clearInterval(interval);
    checkForFlash();

    // ═══ THE REPORT ═══ no loading screen at any point.
    expect(sawLoadingScreen).toBe(false);
    expect(container.querySelector(".app__loading")).toBeNull();

    // And the editor was PATCHED, not torn down and rebuilt: a remount would
    // produce a different node here.
    expect(screen.getByTestId("editor")).toBe(editorBefore);
    expect(app.domain.loadState).toBe("loaded");
  });

  it("the refreshed content is actually visible in the DOM", async () => {
    render(
      <StoreProvider store={app}>
        <AppContainer />
      </StoreProvider>,
    );

    const renamed: Project = tinyProject();
    renamed.objects[0].name = "Renamed By Peer";

    const sync = new SyncController(app.domain, app.session, {
      reload: async () => {
        await Promise.resolve();
        runInAction(() => app.adoptProject(renamed));
      },
    });
    await act(async () => {
      sync.handleProjectSaved({
        type: "project-saved",
        projectName: app.domain.projectName,
        origin: "peer",
        at: Date.now(),
      });
      await new Promise((r) => setTimeout(r, 200));
    });

    // The point of the refresh: the new state reaches the screen with no
    // reload and no loading screen in between.
    expect(app.domain.objects[0].name).toBe("Renamed By Peer");
    expect(await screen.findByText("Renamed By Peer")).toBeTruthy();
  });
});
