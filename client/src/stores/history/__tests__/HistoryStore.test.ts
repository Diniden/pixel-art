/**
 * HistoryStore unit suite (REFRESH task 17) — the command stack in isolation:
 * cursor semantics, transactions, redo, the replay guard, and the byte/count
 * eviction. The pinned Zustand-parity behaviour (task 08) is exercised
 * end-to-end in `historyIntegration.test.ts`; here the store is fed synthetic
 * commands so every mechanism is observable directly.
 *
 * ⚠️ Memory: no test here holds a realistic project — commands are tiny
 * synthetic objects with declared byte costs.
 */
import { describe, expect, it } from "vitest";
import { runInAction } from "mobx";
import { HistoryStore, MAX_HISTORY_BYTES } from "../HistoryStore";
import {
  createCompositeCommand,
  createSnapshotCommand,
  estimateProjectBytes,
} from "../commands";
import type { Command, SnapshotHost } from "../commands";
import { tinyProject } from "@/store/__tests__/storeContract";
import type { Project } from "@/types";

/** A synthetic command that logs its own replay into `log`. */
const fake = (name: string, log: string[], bytes = 10): Command => ({
  label: name,
  bytes,
  undo: () => log.push(`undo:${name}`),
  redo: () => log.push(`redo:${name}`),
});

const read = <T>(fn: () => T): T => runInAction(fn);

describe("HistoryStore — the command stack", () => {
  it("starts empty: index -1, nothing to undo or redo, zero bytes", () => {
    const store = new HistoryStore();
    read(() => {
      expect(store.entries).toHaveLength(0);
      expect(store.index).toBe(-1);
      expect(store.canUndo).toBe(false);
      expect(store.canRedo).toBe(false);
      expect(store.historyBytes).toBe(0);
      expect(store.isReplaying).toBe(false);
    });
  });

  it("the default budget is MAX_HISTORY_BYTES (64 MB)", () => {
    const store = new HistoryStore();
    expect(MAX_HISTORY_BYTES).toBe(64 * 1024 * 1024);
    read(() => expect(store.budgetBytes).toBe(MAX_HISTORY_BYTES));
  });

  it("record appends and advances the cursor; bytes accumulate", () => {
    const store = new HistoryStore();
    const log: string[] = [];
    runInAction(() => {
      store.record(fake("a", log, 7));
      store.record(fake("b", log, 5));
    });
    read(() => {
      expect(store.entries.map((c) => c.label)).toEqual(["a", "b"]);
      expect(store.index).toBe(1);
      expect(store.canUndo).toBe(true);
      expect(store.historyBytes).toBe(12);
    });
  });

  describe("undo / redo", () => {
    it("undo replays entries[index] and decrements; redo replays entries[index+1] and increments", () => {
      const store = new HistoryStore();
      const log: string[] = [];
      runInAction(() => {
        store.record(fake("a", log));
        store.record(fake("b", log));
      });

      runInAction(() => store.undo());
      expect(log).toEqual(["undo:b"]);
      read(() => expect(store.index).toBe(0));

      runInAction(() => store.undo());
      expect(log).toEqual(["undo:b", "undo:a"]);
      read(() => {
        expect(store.index).toBe(-1);
        expect(store.canUndo).toBe(false);
        expect(store.canRedo).toBe(true);
      });

      runInAction(() => store.redo());
      runInAction(() => store.redo());
      expect(log).toEqual(["undo:b", "undo:a", "redo:a", "redo:b"]);
      read(() => {
        expect(store.index).toBe(1);
        expect(store.canRedo).toBe(false);
      });
    });

    it("undo at -1 and redo at the top are NO-OPs", () => {
      const store = new HistoryStore();
      const log: string[] = [];
      runInAction(() => store.record(fake("a", log)));
      runInAction(() => store.redo()); // already at the top
      expect(log).toEqual([]);
      runInAction(() => store.undo());
      runInAction(() => store.undo()); // below the floor
      expect(log).toEqual(["undo:a"]);
    });

    it("undo/redo do NOT shorten the list — the tail stays reachable", () => {
      const store = new HistoryStore();
      const log: string[] = [];
      runInAction(() => {
        store.record(fake("a", log));
        store.record(fake("b", log));
      });
      runInAction(() => store.undo());
      read(() => {
        expect(store.entries).toHaveLength(2);
        expect(store.canRedo).toBe(true);
      });
    });

    it("sets isReplaying for exactly the duration of the replay", () => {
      const store = new HistoryStore();
      const seen: boolean[] = [];
      runInAction(() =>
        store.record({
          label: "probe",
          bytes: 0,
          undo: () => seen.push(store.isReplaying),
          redo: () => seen.push(store.isReplaying),
        }),
      );
      runInAction(() => store.undo());
      runInAction(() => store.redo());
      expect(seen).toEqual([true, true]);
      read(() => expect(store.isReplaying).toBe(false));
    });

    it("isReplaying clears even when a command throws", () => {
      const store = new HistoryStore();
      runInAction(() =>
        store.record({
          label: "boom",
          bytes: 0,
          undo: () => {
            throw new Error("boom");
          },
          redo: () => {},
        }),
      );
      expect(() => runInAction(() => store.undo())).toThrow("boom");
      read(() => expect(store.isReplaying).toBe(false));
    });

    it("record during a replay is a NO-OP (re-entrancy guard)", () => {
      const store = new HistoryStore();
      const log: string[] = [];
      runInAction(() =>
        store.record({
          label: "reentrant",
          bytes: 0,
          undo: () => store.record(fake("sneaky", log)),
          redo: () => {},
        }),
      );
      runInAction(() => store.undo());
      read(() => expect(store.entries).toHaveLength(1));
    });
  });

  describe("deferred redo-tail truncation (task 08 cursor semantics)", () => {
    it("a new record after an undo discards the redo tail", () => {
      const store = new HistoryStore();
      const log: string[] = [];
      runInAction(() => {
        store.record(fake("a", log));
        store.record(fake("b", log));
        store.record(fake("c", log));
      });
      runInAction(() => store.undo());
      runInAction(() => store.undo());
      read(() => expect(store.entries).toHaveLength(3)); // physically present

      runInAction(() => store.record(fake("d", log)));
      read(() => {
        expect(store.entries.map((c) => c.label)).toEqual(["a", "d"]);
        expect(store.index).toBe(1);
        expect(store.canRedo).toBe(false);
      });
    });

    it("recording from index -1 discards the ENTIRE previous history", () => {
      const store = new HistoryStore();
      const log: string[] = [];
      runInAction(() => {
        store.record(fake("a", log));
        store.record(fake("b", log));
      });
      runInAction(() => store.undo());
      runInAction(() => store.undo());
      runInAction(() => store.record(fake("c", log)));
      read(() => {
        expect(store.entries.map((c) => c.label)).toEqual(["c"]);
        expect(store.index).toBe(0);
      });
    });
  });

  describe("transactions", () => {
    it("commands recorded inside a transaction collapse to ONE composite entry", () => {
      const store = new HistoryStore();
      const log: string[] = [];
      runInAction(() => {
        store.beginTransaction("Draw");
        store.record(fake("p1", log));
        store.record(fake("p2", log));
        store.record(fake("p3", log));
      });
      read(() => expect(store.entries).toHaveLength(0)); // buffered, not pushed
      runInAction(() => store.endTransaction());
      read(() => {
        expect(store.entries).toHaveLength(1);
        expect(store.entries[0].label).toBe("Draw");
        expect(store.entries[0].bytes).toBe(30);
      });
    });

    it("a composite undoes its children in REVERSE order and redoes forward", () => {
      const store = new HistoryStore();
      const log: string[] = [];
      runInAction(() => {
        store.beginTransaction("Draw");
        store.record(fake("p1", log));
        store.record(fake("p2", log));
        store.endTransaction();
      });
      runInAction(() => store.undo());
      expect(log).toEqual(["undo:p2", "undo:p1"]);
      runInAction(() => store.redo());
      expect(log).toEqual(["undo:p2", "undo:p1", "redo:p1", "redo:p2"]);
    });

    it("a one-command transaction pushes the command itself, unwrapped", () => {
      const store = new HistoryStore();
      const log: string[] = [];
      const only = fake("solo", log);
      runInAction(() => {
        store.beginTransaction("Draw");
        store.record(only);
        store.endTransaction();
      });
      read(() => expect(store.entries[0]).toBe(only));
    });

    it("an EMPTY transaction commits nothing; endTransaction without begin is a NO-OP", () => {
      const store = new HistoryStore();
      runInAction(() => {
        store.beginTransaction("Draw");
        store.endTransaction();
        store.endTransaction(); // dangling end
      });
      read(() => expect(store.entries).toHaveLength(0));
      expect(store.inTransaction).toBe(false);
    });

    it("beginTransaction with one already open COMMITS the open one first (nested-beginStroke parity)", () => {
      const store = new HistoryStore();
      const log: string[] = [];
      runInAction(() => {
        store.beginTransaction("First");
        store.record(fake("a", log));
        store.beginTransaction("Second"); // commits First
        store.record(fake("b", log));
        store.endTransaction();
      });
      read(() => {
        expect(store.entries.map((c) => c.label)).toEqual(["a", "b"]);
      });
    });

    it("replaceEntries adopts external history but leaves an open transaction untouched", () => {
      // Parity with task 08's pinned observation: the legacy `_strokeActive`
      // closure survived a store reset.
      const store = new HistoryStore();
      const log: string[] = [];
      runInAction(() => {
        store.record(fake("stale", log));
        store.beginTransaction("Draw");
        store.replaceEntries([], -1);
      });
      read(() => {
        expect(store.entries).toHaveLength(0);
        expect(store.index).toBe(-1);
      });
      expect(store.inTransaction).toBe(true);
      runInAction(() => store.endTransaction()); // clean up
    });

    it("replaceEntries clamps an out-of-range index", () => {
      const store = new HistoryStore();
      const log: string[] = [];
      runInAction(() => store.replaceEntries([fake("a", log)], 99));
      read(() => expect(store.index).toBe(0));
      runInAction(() => store.replaceEntries([], 5));
      read(() => expect(store.index).toBe(-1));
    });
  });

  describe("eviction — byte budget and the bridge-era count cap", () => {
    it("evicts from the FRONT until under the byte budget", () => {
      const store = new HistoryStore({ budgetBytes: 100 });
      const log: string[] = [];
      runInAction(() => {
        for (let i = 0; i < 10; i++) {
          store.record(fake(`c${i}`, log, 30));
        }
      });
      read(() => {
        // 3 × 30 = 90 ≤ 100; a fourth would be 120.
        expect(store.entries.map((c) => c.label)).toEqual(["c7", "c8", "c9"]);
        expect(store.index).toBe(2);
        expect(store.historyBytes).toBe(90);
      });
    });

    it("a single over-budget entry is RETAINED — never evict to empty", () => {
      const store = new HistoryStore({ budgetBytes: 100 });
      const log: string[] = [];
      runInAction(() => store.record(fake("huge", log, 500)));
      read(() => {
        expect(store.entries).toHaveLength(1);
        expect(store.canUndo).toBe(true);
      });
    });

    it("enforces the entry-count cap, front-shifting (MAX_HISTORY parity)", () => {
      const store = new HistoryStore({ maxEntries: 5 });
      const log: string[] = [];
      runInAction(() => {
        for (let i = 0; i < 8; i++) {
          store.record(fake(`c${i}`, log, 1));
        }
      });
      read(() => {
        expect(store.entries.map((c) => c.label)).toEqual([
          "c3",
          "c4",
          "c5",
          "c6",
          "c7",
        ]);
        expect(store.index).toBe(4);
      });
    });

    it("setBudgetBytes shrinking the budget evicts immediately", () => {
      const store = new HistoryStore({ budgetBytes: 1000 });
      const log: string[] = [];
      runInAction(() => {
        for (let i = 0; i < 5; i++) store.record(fake(`c${i}`, log, 30));
      });
      runInAction(() => store.setBudgetBytes(70));
      read(() => {
        expect(store.entries.map((c) => c.label)).toEqual(["c3", "c4"]);
        expect(store.index).toBe(1);
      });
    });
  });

  describe("snapshot provider and clear", () => {
    it("snapshot(label) records what the provider builds; a null provider result records nothing", () => {
      const log: string[] = [];
      let give = true;
      const store = new HistoryStore({
        makeSnapshot: (label) => (give ? fake(label, log, 3) : null),
      });
      runInAction(() => store.snapshot("Resize object"));
      give = false;
      runInAction(() => store.snapshot("Nothing"));
      read(() => {
        expect(store.entries.map((c) => c.label)).toEqual(["Resize object"]);
      });
    });

    it("clear resets entries, cursor AND any open transaction", () => {
      const log: string[] = [];
      const store = new HistoryStore();
      runInAction(() => {
        store.record(fake("a", log));
        store.beginTransaction("Draw");
        store.clear();
      });
      read(() => {
        expect(store.entries).toHaveLength(0);
        expect(store.index).toBe(-1);
      });
      expect(store.inTransaction).toBe(false);
    });
  });
});

describe("SnapshotCommand — the full-clone family", () => {
  /** A minimal in-memory host over a mutable `live` slot. */
  const makeHost = (): { host: SnapshotHost; live: { p: Project | null } } => {
    const live: { p: Project | null } = { p: null };
    return {
      live,
      host: {
        current: () => live.p,
        restore: (project) => {
          live.p = { ...project, referenceImage: live.p?.referenceImage };
        },
      },
    };
  };

  it("captures an independent clone: mutating the source later cannot corrupt it", () => {
    const { host } = makeHost();
    const source = tinyProject();
    const command = createSnapshotCommand({
      label: "Edit",
      project: source,
      host,
    });
    source.objects[0].name = "mutated in place";
    expect(command.before.objects[0].name).toBe("Object 1");
    expect(command.before).not.toBe(source);
  });

  it("undo restores a CLONE of `before` and lazily captures the live state for redo", () => {
    const { host, live } = makeHost();
    const original = tinyProject();
    live.p = original;
    const command = createSnapshotCommand({
      label: "Edit",
      project: original,
      host,
    });

    // Simulate the tracked mutation the command guards.
    live.p = tinyProject();
    live.p.objects[0].name = "AFTER";

    command.undo();
    expect(live.p!.objects[0].name).toBe("Object 1");
    expect(live.p).not.toBe(command.before); // restore is a clone

    command.redo();
    expect(live.p!.objects[0].name).toBe("AFTER");
  });

  it("redo before any undo is a defensive NO-OP", () => {
    const { host, live } = makeHost();
    live.p = tinyProject();
    const command = createSnapshotCommand({
      label: "Edit",
      project: live.p,
      host,
    });
    const before = live.p;
    command.redo();
    expect(live.p).toBe(before);
  });

  it("referenceImage is EXCLUDED from the command (spec, task 17)", () => {
    const { host, live } = makeHost();
    const withImage = tinyProject();
    withImage.referenceImage = {
      imageBase64: "data:image/png;base64,AAAA",
      selectionBox: { startX: 0, startY: 0, endX: 1, endY: 1 },
    };
    live.p = withImage;
    const command = createSnapshotCommand({
      label: "Edit",
      project: withImage,
      host,
    });
    expect(command.before.referenceImage).toBeUndefined();

    // …and undo re-attaches the LIVE reference image, not a historical one.
    command.undo();
    expect(live.p!.referenceImage).toBe(withImage.referenceImage);
  });

  it("adopt: true wraps an existing snapshot BY REFERENCE (bridge adoption)", () => {
    const { host } = makeHost();
    const snapshot = tinyProject();
    const command = createSnapshotCommand({
      label: "Edit",
      project: snapshot,
      host,
      adopt: true,
    });
    expect(command.before).toBe(snapshot);
  });

  it("estimates bytes structurally — a 4×4 grid costs cells×24 plus overhead", () => {
    const project = tinyProject();
    const bytes = estimateProjectBytes(project);
    // 1 layer × 16 cells × 24 B + 1024 node overhead + 4096 base.
    expect(bytes).toBe(16 * 24 + 1024 + 4096);
    const { host } = makeHost();
    const command = createSnapshotCommand({ label: "Edit", project, host });
    expect(command.bytes).toBe(bytes);
  });

  it("a composite carries the FIRST child's `before` for the bridge mirror", () => {
    const { host } = makeHost();
    const first = createSnapshotCommand({
      label: "Edit",
      project: tinyProject(),
      host,
    });
    const composite = createCompositeCommand("Draw", [
      first,
      createSnapshotCommand({ label: "Edit", project: tinyProject(), host }),
    ]);
    expect(composite.before).toBe(first.before);
  });
});
