/**
 * BrushStore unit suite (Brush Studio task 07).
 *
 * Drives the store against a fake in-memory `BrushApiLike` and a bare
 * `SessionStore` — no ApplicationStore, no MSW handlers, no network. The
 * `AutoSaveController` wiring test at the end runs under fake timers with an
 * injected save spy, the same rig shape as `autoSaveController.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  flowResult,
  isObservable,
  isObservableArray,
  isObservableObject,
  isObservableProp,
  runInAction,
} from "mobx";

import { ApiError, isKind } from "@/api";
import { BrushStore, type BrushApiLike } from "@/stores/domain/BrushStore";
import { HistoryStore } from "@/stores/history/HistoryStore";
import { AutoSaveController } from "@/stores/session/AutoSaveController";
import { SessionStore } from "@/stores/session/SessionStore";
import { createBrushDocument, type BrushDocument } from "@/types";

/* ── the fake API ────────────────────────────────────────────────────────── */

interface FakeApi {
  api: BrushApiLike;
  files: Map<string, unknown>;
  list: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  rename: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

/**
 * An in-memory brush directory. `list()` returns names in INSERTION order —
 * deliberately unsorted, so a test can prove the store loads `list[0]` as
 * returned rather than sorting on its own.
 */
function makeFakeApi(initial: Record<string, unknown> = {}): FakeApi {
  const files = new Map<string, unknown>(Object.entries(initial));
  const notFound = (name: string) =>
    new ApiError({
      kind: "notFound",
      path: "/brush",
      status: 404,
      message: name,
    });
  const list = vi.fn(async () => [...files.keys()]);
  const get = vi.fn(async (name: string) => {
    if (!files.has(name)) throw notFound(name);
    return files.get(name);
  });
  const create = vi.fn(async (name: string, doc?: BrushDocument) => {
    if (files.has(name)) {
      throw new ApiError({
        kind: "conflict",
        path: "/brush/create",
        status: 409,
      });
    }
    files.set(name, doc ?? createBrushDocument());
    return { success: true as const, name };
  });
  const rename = vi.fn(async (oldName: string, newName: string) => {
    if (!files.has(oldName)) throw notFound(oldName);
    const doc = files.get(oldName);
    files.delete(oldName);
    files.set(newName, doc);
  });
  const remove = vi.fn(async (name: string) => {
    if (!files.has(name)) throw notFound(name);
    files.delete(name);
  });
  const api: BrushApiLike = {
    list,
    get,
    save: async (doc, name) => {
      files.set(name, doc);
      return { success: true };
    },
    create,
    rename,
    remove,
  };
  return { api, files, list, get, create, rename, remove };
}

function makeStore(
  fake: FakeApi,
  extra: { onDocumentInstalled?: (doc: BrushDocument | null) => void } = {},
) {
  const session = new SessionStore();
  const store = new BrushStore({ session, api: fake.api, ...extra });
  return { store, session };
}

/** A structural edit: rename layer 1 in every frame, spine-copied. */
function renameFirstLayer(doc: BrushDocument): BrushDocument {
  return {
    ...doc,
    frames: doc.frames.map((f) => ({
      ...f,
      layers: f.layers.map((l, i) => (i === 0 ? { ...l, name: "Renamed" } : l)),
    })),
  };
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

/* ── construction ────────────────────────────────────────────────────────── */

describe("construction", () => {
  it("starts idle with no document, an empty list and a PRIVATE history", () => {
    const { store } = makeStore(makeFakeApi());
    expect(store.loadState).toBe("idle");
    expect(store.loadError).toBeNull();
    expect(store.document).toBeNull();
    expect(store.hasBrush).toBe(false);
    expect(store.brushName).toBe("");
    expect(store.saveName).toBe("");
    expect(store.brushList).toEqual([]);
    expect(store.serialize()).toBeNull();
    expect(store.history).toBeInstanceOf(HistoryStore);
    // Two stores never share a stack unless one is injected.
    expect(makeStore(makeFakeApi()).store.history).not.toBe(store.history);
  });

  it("adopts an injected HistoryStore", () => {
    const history = new HistoryStore();
    const store = new BrushStore({
      session: new SessionStore(),
      api: makeFakeApi().api,
      history,
    });
    expect(store.history).toBe(history);
  });
});

/* ── init ────────────────────────────────────────────────────────────────── */

describe("init", () => {
  it("with an empty list → idle, no document, list adopted", async () => {
    const { store } = makeStore(makeFakeApi());
    await flowResult(store.init());
    expect(store.loadState).toBe("idle");
    expect(store.document).toBeNull();
    expect(store.brushList).toEqual([]);
    expect(store.loadGeneration).toBe(0);
  });

  it("loads list[0] AS RETURNED BY THE API — the server sorts, the store does not", async () => {
    const fake = makeFakeApi({
      b: createBrushDocument(4, 4),
      a: createBrushDocument(8, 8),
    });
    const { store } = makeStore(fake);
    await flowResult(store.init());

    expect(store.brushList).toEqual(["b", "a"]);
    expect(store.brushName).toBe("b");
    expect(store.saveName).toBe("b");
    expect(store.loadState).toBe("loaded");
    expect(store.hasBrush).toBe(true);
    expect(store.document?.width).toBe(4);
    expect(store.loadGeneration).toBe(1);
    expect(fake.get).toHaveBeenCalledWith("b");
  });

  it("never throws: a failing list() → failed + loadError, no document", async () => {
    const fake = makeFakeApi();
    const error = new ApiError({
      kind: "server",
      path: "/brushes",
      status: 500,
    });
    fake.list.mockRejectedValueOnce(error);
    const { store } = makeStore(fake);

    await expect(flowResult(store.init())).resolves.toBeUndefined();
    expect(store.loadState).toBe("failed");
    expect(store.loadError).toBe(error);
    expect(store.document).toBeNull();
  });

  it("never throws: a corrupt first brush → failed with an 'unknown' ApiError", async () => {
    const { store } = makeStore(makeFakeApi({ bad: { nope: true } }));
    await flowResult(store.init());
    expect(store.loadState).toBe("failed");
    expect(isKind(store.loadError, "unknown")).toBe(true);
    expect(store.document).toBeNull();
  });

  it("is a synchronous no-op while loading or once loaded (StrictMode guard)", async () => {
    const fake = makeFakeApi({ a: createBrushDocument() });
    const { store } = makeStore(fake);
    const first = flowResult(store.init());
    const second = flowResult(store.init()); // fired while `loading`
    await Promise.all([first, second]);
    await flowResult(store.init()); // fired after `loaded`
    expect(fake.list).toHaveBeenCalledTimes(1);
    expect(fake.get).toHaveBeenCalledTimes(1);
  });

  it("allows a retry after a failure", async () => {
    const fake = makeFakeApi({ a: createBrushDocument() });
    fake.list.mockRejectedValueOnce(new Error("boom"));
    const { store } = makeStore(fake);
    await flowResult(store.init());
    expect(store.loadState).toBe("failed");
    expect(store.loadError).toBeNull(); // not an ApiError
    await flowResult(store.init());
    expect(store.loadState).toBe("loaded");
    expect(store.loadError).toBeNull();
  });
});

/* ── loadBrush ───────────────────────────────────────────────────────────── */

describe("loadBrush", () => {
  it("normalises the raw payload and installs it", async () => {
    // A sparse, slightly malformed-but-recoverable file: missing
    // appliedGroups, a short row, a bogus channel type.
    const raw = {
      width: 2,
      height: 2,
      frames: [
        {
          id: "f",
          layers: [
            { id: "l", channelType: "bogus", pixels: [[[300, 0, 0, 0]]] },
          ],
        },
      ],
    };
    const { store } = makeStore(makeFakeApi({ sparse: raw }));
    const doc = await flowResult(store.loadBrush("sparse"));

    expect(store.document).toBe(doc);
    expect(doc.version).toBe("brush-1");
    expect(doc.appliedGroups).toEqual([]);
    expect(doc.frames[0].layers[0].channelType).toBe("rgb");
    expect(doc.frames[0].layers[0].pixels).toEqual([
      [[255, 0, 0, 0], 0],
      [0, 0],
    ]);
    expect(store.loadState).toBe("loaded");
    expect(store.brushName).toBe("sparse");
  });

  it("of a malformed payload → failed, 'unknown' ApiError, document UNCHANGED", async () => {
    const fake = makeFakeApi({ good: createBrushDocument(), bad: { nope: 1 } });
    const { store } = makeStore(fake);
    await flowResult(store.loadBrush("good"));
    const installed = store.document;
    const generation = store.loadGeneration;

    const error = await flowResult(store.loadBrush("bad")).then(
      () => null,
      (e: unknown) => e,
    );

    expect(isKind(error, "unknown")).toBe(true);
    expect(store.loadState).toBe("failed");
    expect(store.loadError).toBe(error);
    expect(store.document).toBe(installed);
    expect(store.loadGeneration).toBe(generation);
    // R5: the store never fabricates a blank brush on failure.
    expect(store.document).not.toBeNull();
  });

  it("of a missing brush → failed with the API's notFound error, document unchanged", async () => {
    const { store } = makeStore(makeFakeApi());
    const error = await flowResult(store.loadBrush("ghost")).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isKind(error, "notFound")).toBe(true);
    expect(store.loadState).toBe("failed");
    expect(store.loadError).toBe(error);
    expect(store.document).toBeNull();
  });

  it("a fresh install clears the undo stack", async () => {
    const fake = makeFakeApi({
      a: createBrushDocument(),
      b: createBrushDocument(),
    });
    const { store } = makeStore(fake);
    await flowResult(store.loadBrush("a"));
    store.commit("edit", renameFirstLayer);
    expect(store.history.canUndo).toBe(true);
    await flowResult(store.loadBrush("b"));
    expect(store.history.canUndo).toBe(false);
    expect(store.history.entries).toEqual([]);
  });
});

/* ── createBrush ─────────────────────────────────────────────────────────── */

describe("createBrush", () => {
  it("calls api.create with a normalised 16×16 document, then installs it", async () => {
    const fake = makeFakeApi();
    const { store } = makeStore(fake);
    await flowResult(store.init());
    expect(store.loadGeneration).toBe(0);

    const ok = await flowResult(store.createBrush("fresh"));

    expect(ok).toBe(true);
    expect(fake.create).toHaveBeenCalledTimes(1);
    const [name, sent] = fake.create.mock.calls[0] as [string, BrushDocument];
    expect(name).toBe("fresh");
    expect(sent).toEqual(createBrushDocument(16, 16));
    expect(sent.width).toBe(16);
    expect(sent.height).toBe(16);
    expect(sent.frames[0].layers[0].pixels).toHaveLength(16);

    expect(store.document).toEqual(sent);
    expect(store.brushName).toBe("fresh");
    expect(store.brushList).toEqual(["fresh"]);
    expect(store.loadState).toBe("loaded");
    expect(store.loadGeneration).toBe(1);
  });

  it("honours a custom size", async () => {
    const fake = makeFakeApi();
    const { store } = makeStore(fake);
    await flowResult(store.createBrush("wide", 32, 8));
    expect(store.document?.width).toBe(32);
    expect(store.document?.height).toBe(8);
  });

  it("returns false on a conflict and leaves the loaded brush intact", async () => {
    const fake = makeFakeApi({ a: createBrushDocument(4, 4) });
    const { store } = makeStore(fake);
    await flowResult(store.init());
    const installed = store.document;

    const ok = await flowResult(store.createBrush("a"));

    expect(ok).toBe(false);
    expect(store.document).toBe(installed);
    expect(store.brushName).toBe("a");
    expect(consoleError).toHaveBeenCalled();
  });
});

/* ── switchBrush ─────────────────────────────────────────────────────────── */

describe("switchBrush", () => {
  it("suspends auto-save for its duration and lifts it after", async () => {
    const fake = makeFakeApi({
      a: createBrushDocument(),
      b: createBrushDocument(),
    });
    const { store, session } = makeStore(fake);
    await flowResult(store.init());
    expect(session.saveSuspended).toBe(false);

    // Hold the GET so we can observe the flow mid-flight.
    let release!: (value: unknown) => void;
    fake.get.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)),
    );
    const pending = flowResult(store.switchBrush("b"));
    await Promise.resolve();
    expect(session.saveSuspended).toBe(true);
    expect(store.loadState).toBe("loading");

    release(createBrushDocument(2, 2));
    expect(await pending).toBe(true);
    expect(session.saveSuspended).toBe(false);
    expect(store.brushName).toBe("b");
    expect(store.document?.width).toBe(2);
    expect(store.loadState).toBe("loaded");
  });

  it("on failure restores the previous loadState, keeps the old document, lifts the suspend", async () => {
    const fake = makeFakeApi({ a: createBrushDocument() });
    const { store, session } = makeStore(fake);
    await flowResult(store.init());
    const installed = store.document;

    const ok = await flowResult(store.switchBrush("ghost"));

    expect(ok).toBe(false);
    expect(store.loadState).toBe("loaded");
    expect(store.document).toBe(installed);
    expect(store.brushName).toBe("a");
    expect(session.saveSuspended).toBe(false);
  });
});

/* ── renameBrush / deleteBrush / refreshList ─────────────────────────────── */

describe("renameBrush", () => {
  it("renames on the server, adopts the new name and list, keeps the document", async () => {
    const fake = makeFakeApi({ a: createBrushDocument() });
    const { store, session } = makeStore(fake);
    await flowResult(store.init());
    const installed = store.document;

    expect(await flowResult(store.renameBrush("z"))).toBe(true);
    expect(fake.rename).toHaveBeenCalledWith("a", "z");
    expect(store.brushName).toBe("z");
    expect(store.saveName).toBe("z");
    expect(store.brushList).toEqual(["z"]);
    expect(store.document).toBe(installed);
    expect(session.saveSuspended).toBe(false);
  });

  it("returns false with no brush loaded and without calling the API", async () => {
    const fake = makeFakeApi();
    const { store } = makeStore(fake);
    expect(await flowResult(store.renameBrush("z"))).toBe(false);
    expect(fake.rename).not.toHaveBeenCalled();
  });

  it("returns false when the server rejects and keeps the old name", async () => {
    const fake = makeFakeApi({ a: createBrushDocument() });
    fake.rename.mockRejectedValueOnce(
      new ApiError({ kind: "conflict", path: "/brush/rename", status: 409 }),
    );
    const { store } = makeStore(fake);
    await flowResult(store.init());
    expect(await flowResult(store.renameBrush("z"))).toBe(false);
    expect(store.brushName).toBe("a");
  });
});

describe("deleteBrush", () => {
  it("loads the first remaining brush", async () => {
    const fake = makeFakeApi({
      a: createBrushDocument(4, 4),
      b: createBrushDocument(8, 8),
    });
    const { store, session } = makeStore(fake);
    await flowResult(store.init());

    expect(await flowResult(store.deleteBrush())).toBe(true);
    expect(fake.remove).toHaveBeenCalledWith("a");
    expect(store.brushList).toEqual(["b"]);
    expect(store.brushName).toBe("b");
    expect(store.document?.width).toBe(8);
    expect(store.loadState).toBe("loaded");
    expect(store.loadGeneration).toBe(2);
    expect(session.saveSuspended).toBe(false);
  });

  it("deleting the LAST brush → idle, null document, history cleared, generation advanced", async () => {
    const fake = makeFakeApi({ only: createBrushDocument() });
    const installed: (BrushDocument | null)[] = [];
    const { store } = makeStore(fake, {
      onDocumentInstalled: (doc) => installed.push(doc),
    });
    await flowResult(store.init());
    store.commit("edit", renameFirstLayer);
    expect(store.history.canUndo).toBe(true);

    expect(await flowResult(store.deleteBrush())).toBe(true);
    expect(store.loadState).toBe("idle");
    expect(store.document).toBeNull();
    expect(store.hasBrush).toBe(false);
    expect(store.brushName).toBe("");
    expect(store.brushList).toEqual([]);
    expect(store.history.canUndo).toBe(false);
    expect(store.loadGeneration).toBe(2);
    expect(installed[installed.length - 1]).toBeNull();
  });

  it("returns false with no brush loaded", async () => {
    const fake = makeFakeApi();
    const { store } = makeStore(fake);
    expect(await flowResult(store.deleteBrush())).toBe(false);
    expect(fake.remove).not.toHaveBeenCalled();
  });
});

describe("refreshList", () => {
  it("adopts the server's list without touching the document", async () => {
    const fake = makeFakeApi({ a: createBrushDocument() });
    const { store, session } = makeStore(fake);
    await flowResult(store.init());
    const installed = store.document;
    fake.files.set("zzz", createBrushDocument());

    await flowResult(store.refreshList());

    expect(store.brushList).toEqual(["a", "zzz"]);
    expect(store.document).toBe(installed);
    expect(session.saveSuspended).toBe(false);
  });
});

/* ── commit / history ────────────────────────────────────────────────────── */

describe("commit", () => {
  it("records ONE command into the store's own history, bumps domainVersion, replaces the document", async () => {
    const { store } = makeStore(makeFakeApi({ a: createBrushDocument() }));
    await flowResult(store.init());
    const before = store.document!;
    const domainV = store.domainVersion;
    const pixelV = store.pixelVersion;

    store.commit("Rename layer", renameFirstLayer);

    expect(store.history.entries).toHaveLength(1);
    expect(store.history.entries[0].label).toBe("Rename layer");
    expect(store.history.canUndo).toBe(true);
    expect(store.domainVersion).toBe(domainV + 1);
    expect(store.pixelVersion).toBe(pixelV); // structural op, pixels untouched
    expect(store.document).not.toBe(before);
    expect(store.document?.frames[0].layers[0].name).toBe("Renamed");
    // The pre-mutation document is untouched — mutate() was a spine copy.
    expect(before.frames[0].layers[0].name).toBe("Layer 1");
  });

  it("undo restores the OLD reference and bumps pixelVersion; redo restores the new one", async () => {
    const installed: (BrushDocument | null)[] = [];
    const { store } = makeStore(makeFakeApi({ a: createBrushDocument() }), {
      onDocumentInstalled: (doc) => installed.push(doc),
    });
    await flowResult(store.init());
    const before = store.document!;
    store.commit("Rename layer", renameFirstLayer);
    const after = store.document!;
    const domainV = store.domainVersion;
    const pixelV = store.pixelVersion;

    store.history.undo();
    expect(store.document).toBe(before);
    expect(store.pixelVersion).toBe(pixelV + 1);
    expect(store.domainVersion).toBe(domainV + 1);
    expect(store.history.entries).toHaveLength(1); // no command recorded by the restore
    expect(installed[installed.length - 1]).toBe(before);

    store.history.redo();
    expect(store.document).toBe(after);
    expect(store.pixelVersion).toBe(pixelV + 2);
    expect(store.history.entries).toHaveLength(1);
    expect(installed[installed.length - 1]).toBe(after);
  });

  it("a mutate() that returns the same object records nothing and bumps nothing", async () => {
    const { store } = makeStore(makeFakeApi({ a: createBrushDocument() }));
    await flowResult(store.init());
    const before = store.document!;
    const domainV = store.domainVersion;

    store.commit("noop", (doc) => doc);

    expect(store.history.entries).toHaveLength(0);
    expect(store.domainVersion).toBe(domainV);
    expect(store.document).toBe(before);
  });

  it("is a no-op with no document loaded", () => {
    const mutate = vi.fn((doc: BrushDocument) => doc);
    const { store } = makeStore(makeFakeApi());
    store.commit("x", mutate);
    expect(mutate).not.toHaveBeenCalled();
    expect(store.history.entries).toHaveLength(0);
  });

  it("forwards bumpPixels so a structural op that changes rendering can redraw", async () => {
    const { store } = makeStore(makeFakeApi({ a: createBrushDocument() }));
    await flowResult(store.init());
    const pixelV = store.pixelVersion;
    store.commit("Hide layer", renameFirstLayer, { bumpPixels: true });
    expect(store.pixelVersion).toBe(pixelV + 1);
  });

  it("commits stack and unwind in order through the private history", async () => {
    const { store } = makeStore(makeFakeApi({ a: createBrushDocument() }));
    await flowResult(store.init());
    const v0 = store.document!;
    store.commit("1", (d) => ({ ...d, width: 17 }));
    const v1 = store.document!;
    store.commit("2", (d) => ({ ...d, width: 18 }));
    const v2 = store.document!;

    store.history.undo();
    expect(store.document).toBe(v1);
    store.history.undo();
    expect(store.document).toBe(v0);
    store.history.redo();
    expect(store.document).toBe(v1);
    store.history.redo();
    expect(store.document).toBe(v2);
  });
});

describe("bumpPixelVersion", () => {
  it("advances pixelVersion only", async () => {
    const { store } = makeStore(makeFakeApi({ a: createBrushDocument() }));
    await flowResult(store.init());
    const domainV = store.domainVersion;
    store.bumpPixelVersion();
    expect(store.pixelVersion).toBe(1);
    expect(store.domainVersion).toBe(domainV);
  });
});

/* ── THE observable.ref CONTRACT ─────────────────────────────────────────── */

describe("document is observable.ref — never a proxy", () => {
  it("the field is observable but the document and its grids are raw", async () => {
    const { store } = makeStore(makeFakeApi({ a: createBrushDocument(4, 4) }));
    await flowResult(store.init());
    const doc = store.document!;

    expect(isObservableProp(store, "document")).toBe(true);
    expect(isObservableObject(doc)).toBe(false);
    expect(isObservable(doc)).toBe(false);
    expect(isObservableArray(doc.frames)).toBe(false);
    expect(isObservableObject(doc.frames[0])).toBe(false);
    expect(isObservableArray(doc.frames[0].layers)).toBe(false);
    expect(isObservableObject(doc.frames[0].layers[0])).toBe(false);

    const grid = doc.frames[0].layers[0].pixels;
    expect(Array.isArray(grid)).toBe(true);
    expect(isObservableArray(grid)).toBe(false);
    expect(Array.isArray(grid[0])).toBe(true);
    expect(isObservableArray(grid[0])).toBe(false);
    expect(isObservable(grid[0])).toBe(false);
    // The exact object the API handed over went in untouched — no wrapping.
    expect(store.serialize()).toBe(doc);
  });

  it("holds after a commit and after an undo restore", async () => {
    const { store } = makeStore(makeFakeApi({ a: createBrushDocument(4, 4) }));
    await flowResult(store.init());
    store.commit("edit", renameFirstLayer);
    expect(isObservableObject(store.document!)).toBe(false);
    expect(isObservableArray(store.document!.frames[0].layers[0].pixels)).toBe(
      false,
    );
    store.history.undo();
    expect(isObservableObject(store.document!)).toBe(false);
    expect(isObservableArray(store.document!.frames[0].layers[0].pixels)).toBe(
      false,
    );
  });

  it("brushList is shallow: the array is tracked, its strings are strings", async () => {
    const { store } = makeStore(makeFakeApi({ a: createBrushDocument() }));
    await flowResult(store.init());
    expect(isObservableArray(store.brushList)).toBe(true);
    expect(typeof store.brushList[0]).toBe("string");
  });
});

/* ── AutoSaveController wiring ───────────────────────────────────────────── */

describe("AutoSaveController<BrushDocument> over a BrushStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("a replaceDocument after load fires ONE save with the document and the brush name", async () => {
    const fake = makeFakeApi({ a: createBrushDocument(4, 4) });
    const { store, session } = makeStore(fake);
    const save = vi.fn(async () => ({ success: true }));
    const controller = new AutoSaveController<BrushDocument>(
      store,
      session,
      store.history,
      { save },
    );
    try {
      await flowResult(store.init());
      // Opening the gate is not an edit.
      vi.advanceTimersByTime(60_000);
      expect(save).not.toHaveBeenCalled();

      const next = renameFirstLayer(store.document!);
      runInAction(() => store.replaceDocument(next));
      expect(session.saveStatus).toBe("pending");
      vi.advanceTimersByTime(499);
      expect(save).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledWith(next, "a");
      await vi.advanceTimersByTimeAsync(0);
      expect(session.saveStatus).toBe("saved");
    } finally {
      controller.dispose();
    }
  });

  it("a pixelVersion bump alone also saves (the canvas write path)", async () => {
    const fake = makeFakeApi({ a: createBrushDocument(4, 4) });
    const { store, session } = makeStore(fake);
    const save = vi.fn(async () => ({ success: true }));
    const controller = new AutoSaveController<BrushDocument>(
      store,
      session,
      store.history,
      { save },
    );
    try {
      await flowResult(store.init());
      store.bumpPixelVersion();
      vi.advanceTimersByTime(500);
      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledWith(store.document, "a");
    } finally {
      controller.dispose();
    }
  });

  it("nothing saves while idle (no brush) or after a failed load — the R5 gate", async () => {
    const fake = makeFakeApi({ bad: { nope: 1 } });
    const { store, session } = makeStore(fake);
    const save = vi.fn(async () => ({ success: true }));
    const controller = new AutoSaveController<BrushDocument>(
      store,
      session,
      store.history,
      { save },
    );
    try {
      store.bumpPixelVersion(); // idle
      vi.advanceTimersByTime(60_000);
      expect(save).not.toHaveBeenCalled();

      await flowResult(store.init()); // → failed (corrupt file)
      expect(store.loadState).toBe("failed");
      store.bumpPixelVersion();
      vi.advanceTimersByTime(60_000);
      expect(save).not.toHaveBeenCalled();
    } finally {
      controller.dispose();
    }
  });
});
