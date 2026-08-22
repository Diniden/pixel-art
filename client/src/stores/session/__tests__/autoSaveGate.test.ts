/**
 * ═══ THE R5 REGRESSION TEST — the wave gate (REFRESH task 16) ═══
 *
 * The bug being closed: a failed `GET /api/project` used to fabricate a blank
 * default project store-side, and the next edit auto-saved it OVER the
 * owner's real 1.1 MB file. Task 15 made the API throw; task 16 added the
 * store's load-state gate. The contract this suite pins, end to end over the
 * REAL stack (ApplicationStore + typed API + MSW — the Zustand bridge that
 * used to sit in the middle retired with task 38; the gate is the same):
 *
 *     a failed load produces ZERO `POST /api/project` requests.
 *
 * Real timers on purpose: the 500 ms debounce runs exactly as in production,
 * and MSW's interception is not fighting a faked clock. The waits are ~4× the
 * debounce so a save that COULD fire, would have.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpResponse, http } from "msw";
import { flowResult, runInAction } from "mobx";

import { server } from "@test/mswServer";
import { tinyProject } from "@/store/__tests__/storeContract";
import { ApplicationStore } from "@/stores/ApplicationStore";

const DEBOUNCE_GRACE_MS = 2000; // 4× the 500 ms debounce

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Every POST /api/project that reaches the (mock) server, by project name. */
let projectPosts: string[];

function interceptProjectPosts(): void {
  server.use(
    http.post("*/api/project", ({ request }) => {
      const url = new URL(request.url);
      projectPosts.push(url.searchParams.get("name") ?? "<current>");
      return HttpResponse.json({ success: true, backupCreated: false });
    }),
  );
}

let app: ApplicationStore;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  projectPosts = [];
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  app = new ApplicationStore({ autoSaveEnabled: true });
  interceptProjectPosts();
});

afterEach(() => {
  app.dispose();
  consoleError.mockRestore();
});

describe("THE GATE: a failed load produces ZERO POST /api/project", () => {
  it("GET /api/project → 500: loadState is 'failed', NO blank project is installed, and NOTHING is POSTed", async () => {
    server.use(
      http.get("*/api/project", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 }),
      ),
    );

    // Exactly what AppContainer's effect runs.
    await flowResult(app.domain.initProject());

    // The failure is a STATE, not a fabricated success:
    expect(app.domain.loadState).toBe("failed");
    expect(app.domain.loadError?.kind).toBe("server");
    expect(app.domain.isLoading).toBe(false);
    // R5's old poison: the catch used to install createDefaultProject().
    expect(app.domain.currentProject()).toBeNull();
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to load project:",
      expect.anything(),
    );

    // Now try hard to make it save anyway — every path an edit could take:
    runInAction(() => app.domain.bumpDomainVersion()); //   a rogue counter bump
    runInAction(() => app.domain.bumpPixelVersion());
    app.adoptProject(tinyProject()); //                     a rogue direct install
    app.ui.tool.setTool("eraser"); //                       a real edit action

    await wait(DEBOUNCE_GRACE_MS);

    // ═══ THE WAVE GATE ═══
    expect(projectPosts).toHaveLength(0);
  });

  it("StrictMode double-fire: the second initProject during 'loading' is a no-op — one load, no default, no POST", async () => {
    let gets = 0;
    server.use(
      http.get("*/api/project", () => {
        gets += 1;
        return HttpResponse.json({ error: "down" }, { status: 500 });
      }),
    );

    // React 19 StrictMode runs the effect twice, synchronously back-to-back
    // (W2a R11 site 1). The second call must return before the first yield.
    const first = flowResult(app.domain.initProject());
    const second = flowResult(app.domain.initProject());
    await Promise.all([first, second]);

    expect(gets).toBe(1); // ONE load, not two racing ones
    expect(app.domain.loadState).toBe("failed");
    expect(app.domain.currentProject()).toBeNull();

    await wait(DEBOUNCE_GRACE_MS);
    expect(projectPosts).toHaveLength(0);
  });

  it("a retry after failure CAN recover: the gate re-opens only on a successful load", async () => {
    let failing = true;
    server.use(
      http.get("*/api/project", () =>
        failing
          ? HttpResponse.json({ error: "down" }, { status: 500 })
          : HttpResponse.json({
              version: "1.1.0",
              objects: [],
              palettes: [{ id: "p", name: "P", colors: [0] }],
              variants: [],
              uiState: { selectedColor: 0xff_00_00_ff },
            }),
      ),
    );

    await flowResult(app.domain.initProject());
    expect(app.domain.loadState).toBe("failed");

    failing = false;
    await flowResult(app.domain.initProject()); // the Retry button's call
    expect(app.domain.loadState).toBe("loaded");
    expect(app.domain.currentProject()).not.toBeNull();
    // Loading is NOT an edit: still no POST.
    await wait(DEBOUNCE_GRACE_MS);
    expect(projectPosts).toHaveLength(0);
  });
});

describe("the happy path still saves (the gate blocks failures, not first-runs or edits)", () => {
  it("after a successful load, 10 rapid edits coalesce into EXACTLY ONE POST", async () => {
    // Default MSW handlers: healthy config/list/get.
    await flowResult(app.domain.initProject());
    expect(app.domain.loadState).toBe("loaded");

    for (let i = 0; i < 10; i++) {
      // 10 commits through the trigger the legacy commit path used: one
      // gated `domainVersion` bump per committed mutation.
      runInAction(() => app.domain.bumpDomainVersion());
      await wait(10);
    }
    await wait(DEBOUNCE_GRACE_MS);

    expect(projectPosts).toHaveLength(1);
  });

  it("L7 first-run: GET → 404 loads the default project WITHOUT masking an error — and edits then save", async () => {
    server.use(
      http.get("*/api/project", () =>
        HttpResponse.json({ error: "not found" }, { status: 404 }),
      ),
    );

    await flowResult(app.domain.initProject());

    // The pinned first-run path: a 404 is "no project yet", not a failure.
    expect(app.domain.loadState).toBe("loaded");
    expect(app.domain.currentProject()).not.toBeNull();
    expect(projectPosts).toHaveLength(0); // loading itself never saves

    runInAction(() => app.domain.bumpDomainVersion()); // first real edit
    await wait(DEBOUNCE_GRACE_MS);
    expect(projectPosts).toHaveLength(1); // and THAT saves
  });
});
