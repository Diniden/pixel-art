/**
 * Cross-instance sync — what a PEER's save does to this tab.
 *
 * The specified semantics are last-write-wins for a single author: when
 * another tab saves, this tab reloads and whatever was unsaved here is
 * CLOBBERED. No merge, no conflict prompt, no presence.
 *
 * The two hazards worth pinning are both write-amplification bugs that would
 * corrupt the state being synced:
 *
 *   1. THE ECHO — applying a refresh bumps the domain counters. If auto-save
 *      treated that as an edit, the receiving tab would save the tree straight
 *      back and the two tabs would ping-pong writes forever.
 *
 *   2. THE STRANDED SAVE — a debounced save already queued here must not fire
 *      AFTER the refresh, or it would push the pre-refresh tree back to the
 *      server and silently undo the newer save.
 *
 * Real timers and the real stack (ApplicationStore + typed API + MSW), for the
 * same reasons `autoSaveGate.test.ts` uses them: the 500 ms debounce runs
 * exactly as in production.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpResponse, http } from "msw";
import { autorun, flowResult, runInAction } from "mobx";

import { server } from "@test/mswServer";
import { tinyProject } from "@/store/__tests__/storeContract";
import { ApplicationStore } from "@/stores/ApplicationStore";
import { SyncController } from "@/stores/session/SyncController";
import type { ProjectSavedEvent } from "@/api";
import { projectToCompact } from "@/types";

const DEBOUNCE_GRACE_MS = 2000; // 4× the 500 ms debounce
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Every POST /api/project that reaches the mock server. */
let projectPosts: string[];
/** How many times the project was fetched. */
let projectGets: number;

function interceptProject(): void {
  server.use(
    http.get("*/api/project", () => {
      projectGets += 1;
      return HttpResponse.json(projectToCompact(tinyProject()));
    }),
    http.post("*/api/project", ({ request }) => {
      const url = new URL(request.url);
      projectPosts.push(url.searchParams.get("name") ?? "<current>");
      return HttpResponse.json({ success: true, backupCreated: false });
    }),
  );
}

/** A peer-save notification for whatever project the tab currently holds. */
function peerSaved(projectName: string): ProjectSavedEvent {
  return {
    type: "project-saved",
    projectName,
    origin: "someone-else",
    at: Date.now(),
  };
}

let app: ApplicationStore;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  projectPosts = [];
  projectGets = 0;
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  // `syncEnabled` stays FALSE: we drive SyncController directly rather than
  // opening a real websocket, so the suite tests the decision, not the socket.
  app = new ApplicationStore({ autoSaveEnabled: true });
  interceptProject();
});

afterEach(() => {
  app.dispose();
  consoleError.mockRestore();
});

describe("a peer's save refreshes this tab", () => {
  it("reloads from the server when another tab saves", async () => {
    await flowResult(app.domain.initProject());
    const sync = new SyncController(app.domain, app.session);
    const before = projectGets;

    sync.handleProjectSaved(peerSaved(app.domain.projectName));
    await wait(DEBOUNCE_GRACE_MS);

    expect(projectGets).toBeGreaterThan(before);
    expect(app.domain.loadState).toBe("loaded");
  });

  it("═══ THE ECHO ═══ applying a refresh does NOT trigger a save back", async () => {
    await flowResult(app.domain.initProject());
    const sync = new SyncController(app.domain, app.session);
    projectPosts = [];

    sync.handleProjectSaved(peerSaved(app.domain.projectName));
    await wait(DEBOUNCE_GRACE_MS);

    // A refresh is not an edit. If this fires, two tabs ping-pong forever.
    expect(projectPosts).toHaveLength(0);
  });

  it("═══ THE STRANDED SAVE ═══ a queued debounce cannot fire after the refresh", async () => {
    await flowResult(app.domain.initProject());
    const sync = new SyncController(app.domain, app.session);
    projectPosts = [];

    // Make a local edit, then let a peer's save arrive DURING the 500 ms
    // debounce window — the exact race the suspend window exists to close.
    app.ui.tool.setTool("eraser");
    sync.handleProjectSaved(peerSaved(app.domain.projectName));

    await wait(DEBOUNCE_GRACE_MS);

    // The pending save was dropped: it would have pushed the pre-refresh tree
    // back and undone the newer save.
    expect(projectPosts).toHaveLength(0);
  });

  it("collapses a burst of notifications into a single reload", async () => {
    await flowResult(app.domain.initProject());
    const sync = new SyncController(app.domain, app.session);
    const before = projectGets;

    const name = app.domain.projectName;
    sync.handleProjectSaved(peerSaved(name));
    sync.handleProjectSaved(peerSaved(name));
    sync.handleProjectSaved(peerSaved(name));

    await wait(DEBOUNCE_GRACE_MS);

    // One in flight + at most one coalesced trailing reload — never three.
    expect(projectGets - before).toBeLessThanOrEqual(2);
    expect(projectGets).toBeGreaterThan(before);
  });

  it("auto-save still works normally AFTER a refresh", async () => {
    await flowResult(app.domain.initProject());
    const sync = new SyncController(app.domain, app.session);

    sync.handleProjectSaved(peerSaved(app.domain.projectName));
    await wait(DEBOUNCE_GRACE_MS);
    projectPosts = [];

    // The refresh reinstalls the SERVER's ui state, so the post-refresh edit
    // must differ from what the server sent — setting the tool back to the
    // value already loaded is a no-op and would prove nothing.
    expect(app.ui.tool.selectedTool).toBe("pixel");
    app.ui.tool.setTool("eraser");
    await wait(DEBOUNCE_GRACE_MS);

    // The suspend window must have been LIFTED, not left closed.
    expect(projectPosts.length).toBeGreaterThan(0);
  });
});

describe("═══ NO FLASH ═══ the refresh never unmounts the editor", () => {
  /**
   * `AppContainer` renders `<LoadingLayout />` for ANY `loadState` that is not
   * `"loaded"`. So "does the screen flash?" is exactly "did `loadState` ever
   * leave `loaded`?" — observable, rather than a judgement call about paint.
   */
  it("loadState stays 'loaded' for the WHOLE refresh", async () => {
    await flowResult(app.domain.initProject());
    const sync = new SyncController(app.domain, app.session);

    // Record every value `loadState` takes, the way the observer component does.
    const seen: string[] = [];
    const stop = autorun(() => seen.push(app.domain.loadState));
    expect(seen).toEqual(["loaded"]);

    sync.handleProjectSaved(peerSaved(app.domain.projectName));
    await wait(DEBOUNCE_GRACE_MS);
    stop();

    // A single "loaded" and nothing else: no "loading" tick means the editor
    // was never swapped for the loading screen.
    expect(seen).toEqual(["loaded"]);
    expect(app.domain.loadState).toBe("loaded");
  });

  it("the refreshed data IS installed (the swap really happened)", async () => {
    await flowResult(app.domain.initProject());
    const sync = new SyncController(app.domain, app.session);
    const generationBefore = app.domain.loadGeneration;

    // Serve a DIFFERENT project on the next GET so the swap is observable.
    const renamed = tinyProject();
    renamed.objects[0].name = "Renamed By Peer";
    server.use(
      http.get("*/api/project", () =>
        HttpResponse.json(projectToCompact(renamed)),
      ),
    );

    sync.handleProjectSaved(peerSaved(app.domain.projectName));
    await wait(DEBOUNCE_GRACE_MS);

    expect(app.domain.objects[0].name).toBe("Renamed By Peer");
    // The generation bump is what keeps auto-save from echoing the swap back.
    expect(app.domain.loadGeneration).toBeGreaterThan(generationBefore);
  });

  it("a FAILED refresh keeps the editor on screen with its project intact", async () => {
    await flowResult(app.domain.initProject());
    const sync = new SyncController(app.domain, app.session);
    const nameBefore = app.domain.objects[0]?.name;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    server.use(
      http.get("*/api/project", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 }),
      ),
    );

    sync.handleProjectSaved(peerSaved(app.domain.projectName));
    await wait(DEBOUNCE_GRACE_MS);

    // A refresh that cannot reach the server is a no-op — NOT a reason to
    // throw a working editor onto the error page.
    expect(app.domain.loadState).toBe("loaded");
    expect(app.domain.objects[0]?.name).toBe(nameBefore);
    expect(projectPosts).toHaveLength(0);
    warn.mockRestore();
  });
});

describe("notifications this tab must ignore", () => {
  it("ignores a save for a DIFFERENT project", async () => {
    await flowResult(app.domain.initProject());
    const sync = new SyncController(app.domain, app.session);
    runInAction(() => {
      app.domain.projectName = "Base Unit";
    });
    const before = projectGets;

    sync.handleProjectSaved(peerSaved("Some Other Project"));
    await wait(DEBOUNCE_GRACE_MS);

    // Reloading here would yank the user into a project they are not viewing.
    expect(projectGets).toBe(before);
  });

  it("ignores a peer save when this tab's own load FAILED", async () => {
    server.use(
      http.get("*/api/project", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 }),
      ),
    );
    await flowResult(app.domain.initProject());
    expect(app.domain.loadState).toBe("failed");

    const sync = new SyncController(app.domain, app.session);
    projectPosts = [];

    sync.handleProjectSaved(peerSaved(app.domain.projectName));
    await wait(DEBOUNCE_GRACE_MS);

    // A failed load must STAY failed — and above all must never POST.
    expect(app.domain.loadState).toBe("failed");
    expect(projectPosts).toHaveLength(0);
  });
});
