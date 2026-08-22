/**
 * 🏁 GATE 2 OF REFRESH TASK 37, AS AN EXECUTABLE ASSERTION.
 *
 * The task's second gate is "layout stories render with NO store provider". A
 * grep for store imports is necessary but not sufficient — a transitive
 * import, a `useContext` call or a module-level singleton would all pass a
 * grep and still throw on mount. `.storybook/preview.tsx` supplies only CSS,
 * MSW and a full-height wrapper, so a story is only *claimed* to be
 * provider-free until something actually mounts it.
 *
 * So this file MOUNTS EVERY STORY OF ALL THREE LAYOUTS AND OF `AppShell`,
 * using their real args, with no `StoreProvider`, no `ApplicationStore`, no
 * `installBridge`, no legacy store hook and no decorator of any kind. If any of
 * the four reached a store — directly or three imports deep — these tests
 * would throw rather than pass quietly.
 *
 * ⚠️ Following the W3 lesson (a rule matching nothing looks exactly like a
 * rule that passes), the harness is PROBE-VERIFIED at the bottom of this file:
 * a component that does call `useStores()` is mounted the same way and MUST
 * throw. Without that, "the layouts mount cleanly" could mean the harness
 * silently swallows provider errors.
 *
 * This is the same shape as W24's `CanvasSurface` gate-2 test and W25's
 * `LightingSurface` one, and it makes the same kind of claim: not that the
 * markup is right, but that the ARCHITECTURE holds — `App.tsx` destructured
 * nine store members and read `project.uiState` three more times, and none of
 * that survived into the presentational half.
 */
import { describe, expect, it } from "vitest";
import { render, within } from "@testing-library/react";
import { composeStories } from "@storybook/react-vite";
import * as pixelStories from "../PixelStudioLayout/PixelStudioLayout.stories";
import * as lightingStories from "../LightingStudioLayout/LightingStudioLayout.stories";
import * as loadingStories from "../LoadingLayout/LoadingLayout.stories";
import * as shellStories from "../../components/AppShell/AppShell.stories";

const pixel = composeStories(pixelStories);
const lighting = composeStories(lightingStories);
const loading = composeStories(loadingStories);
const shell = composeStories(shellStories);

describe("PixelStudioLayout — GATE 2: renders with NO store provider", () => {
  it("exposes the empty / typical / dense / focus-mode stories the task requires", () => {
    expect(Object.keys(pixel).sort()).toEqual([
      "Dense",
      "Empty",
      "FocusMode",
      "FrameReferenceHidden",
      "Typical",
    ]);
  });

  for (const name of Object.keys(pixel)) {
    it(`${name} mounts with no provider`, () => {
      const Story = pixel[name as keyof typeof pixel];
      // No wrapper. No context. If the layout or AppShell reached for a
      // store, this line would throw.
      const { container } = render(<Story />);
      expect(container.querySelector(".app")).not.toBeNull();
      expect(container.querySelector(".app__canvas-area")).not.toBeNull();
      // ⚠️ The legacy query hook 8 sites depend on, still on the same node.
      expect(container.querySelector(".canvas-area")).not.toBeNull();
    });
  }

  it("⭐ focus mode removes the left rail and the bottom timeline", () => {
    const { container: normal } = render(<pixel.Typical />);
    expect(normal.querySelector(".app__side-panel--left")).not.toBeNull();
    expect(normal.querySelector(".app__bottom")).not.toBeNull();
    // The right rail is NOT a focus-mode casualty.
    expect(normal.querySelector(".app__side-panel--right")).not.toBeNull();

    const { container: focus } = render(<pixel.FocusMode />);
    expect(focus.querySelector(".app__side-panel--left")).toBeNull();
    expect(focus.querySelector(".app__bottom")).toBeNull();
    expect(focus.querySelector(".app__side-panel--right")).not.toBeNull();
  });

  it("frameReferencePanelVisible=false drops that panel and nothing else", () => {
    // ⚠️ `within(container)`, not the bare queries: Testing Library's
    // top-level queries search `document.body`, and every `render()` in a
    // test stays mounted until cleanup. Comparing two renders in one test with
    // unscoped queries finds the FIRST render's nodes and the negative
    // assertion can never fail. Measured — it did not, until this was scoped.
    const { container: shown } = render(<pixel.Typical />);
    expect(within(shown).getByText("FrameReferencePanel")).toBeTruthy();

    const { container: hidden } = render(<pixel.FrameReferenceHidden />);
    expect(within(hidden).queryByText("FrameReferencePanel")).toBeNull();
    // The reference-IMAGE panel is a different region and survives.
    expect(within(hidden).getByText("ReferenceImagePanel")).toBeTruthy();
  });
});

describe("LightingStudioLayout — GATE 2: renders with NO store provider", () => {
  it("exposes the empty / typical / dense / focus-mode stories", () => {
    expect(Object.keys(lighting).sort()).toEqual([
      "Dense",
      "Empty",
      "FocusMode",
      "Typical",
    ]);
  });

  for (const name of Object.keys(lighting)) {
    it(`${name} mounts with no provider`, () => {
      const Story = lighting[name as keyof typeof lighting];
      const { container } = render(<Story />);
      expect(container.querySelector(".app")).not.toBeNull();
      expect(container.querySelector(".app__canvas-area")).not.toBeNull();
    });
  }

  it("⭐ focus mode removes the left rail and the bottom timeline", () => {
    const { container: normal } = render(<lighting.Typical />);
    expect(normal.querySelector(".app__side-panel--left")).not.toBeNull();
    expect(normal.querySelector(".app__bottom")).not.toBeNull();

    const { container: focus } = render(<lighting.FocusMode />);
    expect(focus.querySelector(".app__side-panel--left")).toBeNull();
    expect(focus.querySelector(".app__bottom")).toBeNull();
    // The floating preview lives INSIDE the canvas area, which focus mode
    // widens rather than removes.
    expect(focus.querySelector(".app__side-panel--right")).not.toBeNull();
  });

  it("renders four FEWER regions than the pixel layout — the measured asymmetry", () => {
    const { container } = render(<lighting.Typical />);
    const { queryByText } = within(container);
    // `App.tsx:190-216`: none of these four exists in lighting mode.
    expect(queryByText("CanvasInfo")).toBeNull();
    expect(queryByText("LayerColors")).toBeNull();
    expect(queryByText("FrameReferencePanel")).toBeNull();
    expect(queryByText("ReferenceImagePanel")).toBeNull();
  });
});

describe("LoadingLayout — GATE 2: renders with NO store provider", () => {
  for (const name of Object.keys(loading)) {
    it(`${name} mounts with no provider`, () => {
      const Story = loading[name as keyof typeof loading];
      const { container } = render(<Story />);
      expect(container.querySelector(".app__loading")).not.toBeNull();
      expect(container.querySelector(".app__loading-content")).not.toBeNull();
    });
  }

  it("the default render is App.tsx:216-226 verbatim — spinner, title, message", () => {
    const { container } = render(<loading.Loading />);
    const { getByText } = within(container);
    expect(container.querySelector(".app__loading-spinner")).not.toBeNull();
    expect(getByText("Loading Pixel Art Editor")).toBeTruthy();
    expect(getByText("Preparing your workspace...")).toBeTruthy();
  });

  it("⭐ the failed page is R5's visible half: no spinner, a reassurance, a Retry", () => {
    const { container } = render(<loading.Failed />);
    const { getByText, getByRole } = within(container);
    // A failed load must NEVER look like it is still loading.
    expect(container.querySelector(".app__loading-spinner")).toBeNull();
    expect(
      getByText(
        "Nothing has been changed on disk — your project file is untouched.",
      ),
    ).toBeTruthy();
    expect(getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});

describe("AppShell — GATE 2: renders with NO store provider", () => {
  for (const name of Object.keys(shell)) {
    it(`${name} mounts with no provider`, () => {
      const Story = shell[name as keyof typeof shell];
      const { container } = render(<Story />);
      expect(container.querySelector(".app")).not.toBeNull();
    });
  }

  it("focus mode is ABSENCE, not a flag — the shell has no focusMode prop", () => {
    const { container: none } = render(<shell.FocusMode />);
    expect(none.querySelector(".app__side-panel--left")).toBeNull();
    expect(none.querySelector(".app__bottom")).toBeNull();

    // Each half is independently omissible, which is only true because they
    // are two optional props rather than one boolean.
    const { container: noLeft } = render(<shell.NoLeftPanel />);
    expect(noLeft.querySelector(".app__side-panel--left")).toBeNull();
    expect(noLeft.querySelector(".app__bottom")).not.toBeNull();

    const { container: noBottom } = render(<shell.NoBottomPanel />);
    expect(noBottom.querySelector(".app__side-panel--left")).not.toBeNull();
    expect(noBottom.querySelector(".app__bottom")).toBeNull();
  });
});

/**
 * ⚠️ THE PROBE — without it, every assertion above is unfalsifiable.
 *
 * W3's lesson, twice-proven in this refresh: a rule that matches nothing looks
 * exactly like a rule that passes. If `render(<Story />)` silently tolerated a
 * missing provider, all 24 tests above would pass no matter what the layouts
 * imported, and gate 2 would be decorative.
 *
 * `useStores()` throws by design when no `StoreProvider` is mounted
 * (`stores/context.tsx`), so mounting a store-touching component through the
 * SAME harness must throw. It does — see
 * `src/containers/__tests__/layoutsGate2Probe.dom.test.tsx`.
 *
 * ⚠️ THE PROBE LIVES IN `containers/`, NOT HERE, AND THAT IS ITSELF A RESULT.
 * Importing `stores/context` from a file under `src/ui/` — even a test file,
 * even to prove a negative — is an ESLint ERROR under the task-05 boundary
 * blocks. Measured: this file failed `bunx eslint .` with exactly that error
 * until the probe moved. The rule that makes the layouts trustworthy is the
 * same rule that refuses to let their test reach for a store, which is a
 * stronger demonstration of the boundary than the probe alone would have been.
 */
