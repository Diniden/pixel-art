/**
 * ReflectionUIStore — lines, draft lifecycle, the cap, and the project-switch
 * reaction (reflection-tool task 03).
 *
 * Pins MASTER D6: session-only state that survives everything except a fresh
 * project install, a hard cap of 8 lines, degenerate (zero-length) lines
 * rejected everywhere, and the `observableRef` contract — `lines`/`draft` are
 * never proxies and every mutation produces a NEW array identity, which is
 * what lets the overlay painter repaint on identity alone.
 *
 * The last block wires a real `ApplicationStore` the way
 * `stores/__tests__/computeds.test.ts` does (no Zustand, no auto-save) to pin
 * that `app.reflection` exists and that bumping `DomainStore.loadGeneration`
 * clears it — and, critically, that `adoptTree` alone (the snapshot-undo
 * path) does NOT.
 */
import { describe, expect, it } from "vitest";
import { isObservable, isObservableProp, runInAction } from "mobx";
import {
  MAX_REFLECTION_LINES,
  ReflectionUIStore,
} from "../ReflectionUIStore";
import { ApplicationStore } from "@/stores/ApplicationStore";
import type { ProjectHost } from "@/stores/domain/DomainStore";
import type { DomainMirror } from "@/stores/domain/DomainMutator";
import type { SelectionSink } from "@/stores/domain/ObjectStore";
import { tinyProject } from "@/store/__tests__/storeContract";

const H = { x1: 0, y1: 4, x2: 8, y2: 4 };
const V = { x1: 4, y1: 0, x2: 4, y2: 8 };

describe("ReflectionUIStore — defaults", () => {
  it("starts with no lines and no draft", () => {
    const s = new ReflectionUIStore();
    expect(s.lines).toEqual([]);
    expect(s.draft).toBeNull();
    expect(s.hasLines).toBe(false);
    expect(s.atCapacity).toBe(false);
  });
});

describe("ReflectionUIStore — add / remove / clear", () => {
  it("addLine stores the geometry and returns the line with an id", () => {
    const s = new ReflectionUIStore();
    const line = runInAction(() => s.addLine(H));
    expect(line).not.toBeNull();
    expect(line?.id).toMatch(/^refl-\d+$/);
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0]).toBe(line);
    expect(s.hasLines).toBe(true);
  });

  it("ids are unique across lines and across stores", () => {
    const a = new ReflectionUIStore();
    const b = new ReflectionUIStore();
    const ids = [
      runInAction(() => a.addLine(H))?.id,
      runInAction(() => a.addLine(V))?.id,
      runInAction(() => b.addLine(H))?.id,
    ];
    expect(new Set(ids).size).toBe(3);
  });

  it("removeLine drops just that line; an unknown id is a no-op", () => {
    const s = new ReflectionUIStore();
    const first = runInAction(() => s.addLine(H));
    runInAction(() => s.addLine(V));
    const before = s.lines;
    runInAction(() => s.removeLine("nope"));
    // No-op keeps identity, so no reaction fires.
    expect(s.lines).toBe(before);
    runInAction(() => s.removeLine(first!.id));
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0]?.x1).toBe(V.x1);
  });

  it("clear() drops every line and the draft", () => {
    const s = new ReflectionUIStore();
    runInAction(() => s.addLine(H));
    runInAction(() => s.beginDraft(1, 1));
    runInAction(() => s.clear());
    expect(s.lines).toEqual([]);
    expect(s.draft).toBeNull();
    expect(s.hasLines).toBe(false);
  });
});

describe("ReflectionUIStore — the cap and degenerate lines", () => {
  it(`refuses lines past ${MAX_REFLECTION_LINES}`, () => {
    const s = new ReflectionUIStore();
    for (let i = 0; i < MAX_REFLECTION_LINES; i += 1) {
      expect(runInAction(() => s.addLine({ x1: i, y1: 0, x2: i, y2: 8 }))).not.toBeNull();
    }
    expect(s.atCapacity).toBe(true);
    expect(runInAction(() => s.addLine(H))).toBeNull();
    expect(s.lines).toHaveLength(MAX_REFLECTION_LINES);
  });

  it("rejects a degenerate (zero-length) line", () => {
    const s = new ReflectionUIStore();
    expect(runInAction(() => s.addLine({ x1: 3, y1: 3, x2: 3, y2: 3 }))).toBeNull();
    expect(s.lines).toEqual([]);
  });

  it("addLines skips degenerates and stops at the cap", () => {
    const s = new ReflectionUIStore();
    const batch = [
      H,
      { x1: 2, y1: 2, x2: 2, y2: 2 }, // degenerate — skipped
      V,
    ];
    runInAction(() => s.addLines(batch));
    expect(s.lines).toHaveLength(2);

    // Overflow: 10 more lines onto 2 already present adds only 6.
    const many = Array.from({ length: 10 }, (_, i) => ({ x1: i, y1: 0, x2: i, y2: 1 }));
    runInAction(() => s.addLines(many));
    expect(s.lines).toHaveLength(MAX_REFLECTION_LINES);

    // A batch that can add nothing keeps identity.
    const before = s.lines;
    runInAction(() => s.addLines([H]));
    expect(s.lines).toBe(before);
  });
});

describe("ReflectionUIStore — draft lifecycle", () => {
  it("beginDraft → updateDraft → commitDraft stores the dragged line", () => {
    const s = new ReflectionUIStore();
    runInAction(() => s.beginDraft(2, 3));
    expect(s.draft).toEqual({ id: "refl-draft", x1: 2, y1: 3, x2: 2, y2: 3 });
    runInAction(() => s.updateDraft(9, 3));
    expect(s.draft).toMatchObject({ x1: 2, y1: 3, x2: 9, y2: 3 });
    const line = runInAction(() => s.commitDraft());
    expect(line).toMatchObject({ x1: 2, y1: 3, x2: 9, y2: 3 });
    expect(s.draft).toBeNull();
    expect(s.lines).toHaveLength(1);
  });

  it("commitDraft on a DEGENERATE draft returns null and still clears it", () => {
    const s = new ReflectionUIStore();
    runInAction(() => s.beginDraft(5, 5));
    expect(runInAction(() => s.commitDraft())).toBeNull();
    expect(s.draft).toBeNull();
    expect(s.lines).toEqual([]);
  });

  it("commitDraft with no draft is a null no-op; cancelDraft discards", () => {
    const s = new ReflectionUIStore();
    expect(runInAction(() => s.commitDraft())).toBeNull();
    runInAction(() => s.beginDraft(1, 1));
    runInAction(() => s.updateDraft(6, 1));
    runInAction(() => s.cancelDraft());
    expect(s.draft).toBeNull();
    expect(s.lines).toEqual([]);
  });

  it("updateDraft without a draft is a no-op", () => {
    const s = new ReflectionUIStore();
    runInAction(() => s.updateDraft(4, 4));
    expect(s.draft).toBeNull();
  });
});

describe("ReflectionUIStore — the observableRef contract", () => {
  it("lines and draft are observable AS REFS: the values are NOT proxies", () => {
    const s = new ReflectionUIStore();
    runInAction(() => s.addLine(H));
    runInAction(() => s.beginDraft(1, 2));
    expect(isObservableProp(s, "lines")).toBe(true);
    expect(isObservableProp(s, "draft")).toBe(true);
    expect(isObservable(s.lines)).toBe(false);
    expect(isObservable(s.lines[0])).toBe(false);
    expect(isObservable(s.draft)).toBe(false);
  });

  it("every effective mutation replaces `lines` with a NEW array identity", () => {
    const s = new ReflectionUIStore();
    const seen: ReadonlyArray<unknown>[] = [];
    const record = () => seen.push(s.lines);

    record();
    runInAction(() => s.addLine(H));
    record();
    runInAction(() => s.addLines([V]));
    record();
    runInAction(() => s.removeLine(s.lines[0]!.id));
    record();
    runInAction(() => s.beginDraft(0, 0));
    runInAction(() => s.updateDraft(0, 7));
    runInAction(() => s.commitDraft());
    record();
    runInAction(() => s.clear());
    record();

    expect(new Set(seen).size).toBe(seen.length);
  });

  it("updateDraft replaces the draft wholesale rather than editing it", () => {
    const s = new ReflectionUIStore();
    runInAction(() => s.beginDraft(0, 0));
    const first = s.draft;
    runInAction(() => s.updateDraft(3, 4));
    expect(s.draft).not.toBe(first);
    expect(first).toEqual({ id: "refl-draft", x1: 0, y1: 0, x2: 0, y2: 0 });
  });
});

/* ── ApplicationStore wiring ─────────────────────────────────────────────── */

/**
 * The cheapest possible real `ApplicationStore` — same recipe as
 * `stores/__tests__/computeds.test.ts`: no auto-save, no Zustand, a host that
 * just holds the project in a local.
 */
function makeApp() {
  const project = tinyProject();
  let current = project;
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
  const selectionSink: SelectionSink = { selectObjectTree: () => {} };
  const app = new ApplicationStore({
    autoSaveEnabled: false,
    projectHost: host,
    domainMirror: mirror,
    selectionSink,
  });
  runInAction(() => app.domain.adoptTree(project));
  return app;
}

describe("ApplicationStore — app.reflection", () => {
  it("exposes a ReflectionUIStore that survives an adoptTree (the undo path)", () => {
    const app = makeApp();
    try {
      expect(app.reflection).toBeInstanceOf(ReflectionUIStore);
      runInAction(() => app.reflection.addLine(H));
      // `adoptProject`/`adoptTree` also runs on snapshot undo/redo — hooking
      // it would wipe the guides on every undo (locked D6).
      runInAction(() => app.domain.adoptTree(tinyProject()));
      expect(app.reflection.lines).toHaveLength(1);
    } finally {
      app.dispose();
    }
  });

  it("clears the lines when a fresh project is installed (loadGeneration)", () => {
    const app = makeApp();
    try {
      runInAction(() => app.reflection.addLines([H, V]));
      runInAction(() => app.reflection.beginDraft(1, 1));
      expect(app.reflection.lines).toHaveLength(2);

      runInAction(() => {
        app.domain.loadGeneration += 1;
      });

      expect(app.reflection.lines).toEqual([]);
      expect(app.reflection.draft).toBeNull();
    } finally {
      app.dispose();
    }
  });

  it("dispose() stops the reaction — a later load leaves the lines alone", () => {
    const app = makeApp();
    runInAction(() => app.reflection.addLine(H));
    app.dispose();
    runInAction(() => {
      app.domain.loadGeneration += 1;
    });
    expect(app.reflection.lines).toHaveLength(1);
  });

  it("is NOT part of the persisted wire format", () => {
    const app = makeApp();
    try {
      runInAction(() => app.reflection.addLine(H));
      const persisted = app.ui.toPersistedUIState() as unknown as Record<
        string,
        unknown
      >;
      expect(Object.keys(persisted)).not.toContain("reflection");
      expect(Object.keys(persisted)).not.toContain("reflectionLines");
      expect(JSON.stringify(persisted)).not.toContain("refl-");
    } finally {
      app.dispose();
    }
  });
});
