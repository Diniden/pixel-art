/**
 * `brushFiles.ts` against a throw-away directory (brush-studio task 02).
 *
 * Every call passes `{ baseDir }` pointing at a `mkdtemp` directory, so the
 * suite never touches `server/src/data/**` — that directory holds the owner's
 * real work and agents cannot read it anyway. If a test here ever reaches the
 * real `BRUSHES_DIR`, that is the bug to fix, not the assertion.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  BRUSHES_DIR,
  BrushNameError,
  brushExists,
  deleteBrush,
  getBrushFilePath,
  listBrushes,
  readBrush,
  renameBrush,
  writeBrush,
} from "../brushFiles.js";

let baseDir: string;

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), "brushes-"));
});

afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true });
});

const opts = () => ({ baseDir });

describe("getBrushFilePath", () => {
  it("joins baseDir with <name>.json", () => {
    expect(getBrushFilePath("a", opts())).toBe(join(baseDir, "a.json"));
  });

  it("defaults to BRUSHES_DIR, a subdirectory of the data dir", () => {
    // The whole point of the subdirectory: `listProjects()` filters a flat
    // readdir of DATA_DIR on `.json`, so a brush beside the project files
    // would be reported as a project.
    expect(getBrushFilePath("a")).toBe(join(BRUSHES_DIR, "a.json"));
    expect(BRUSHES_DIR.endsWith(join("data", "brushes"))).toBe(true);
  });
});

describe("listBrushes", () => {
  it("returns [] for an empty directory", async () => {
    expect(await listBrushes(opts())).toEqual([]);
  });

  it("returns [] when the directory does not exist yet", async () => {
    expect(await listBrushes({ baseDir: join(baseDir, "nope") })).toEqual([]);
  });

  it("lists a written brush by stem", async () => {
    await writeBrush("a", { v: 1 }, opts());
    expect(await listBrushes(opts())).toEqual(["a"]);
  });

  it("sorts stems", async () => {
    await writeBrush("zeta", {}, opts());
    await writeBrush("alpha", {}, opts());
    await writeBrush("mid", {}, opts());
    expect(await listBrushes(opts())).toEqual(["alpha", "mid", "zeta"]);
  });

  it("ignores the .prev directory and a stray notes.txt", async () => {
    await writeBrush("a", { v: 1 }, opts());
    await writeBrush("a", { v: 2 }, opts()); // creates .prev/a.json
    await writeFile(join(baseDir, "notes.txt"), "not a brush", "utf-8");
    expect(existsSync(join(baseDir, ".prev", "a.json"))).toBe(true);

    expect(await listBrushes(opts())).toEqual(["a"]);
  });

  it("ignores a subdirectory even when its name ends in .json", async () => {
    await writeBrush("a", {}, opts());
    await mkdir(join(baseDir, "dir.json"));
    expect(await listBrushes(opts())).toEqual(["a"]);
  });
});

describe("readBrush / writeBrush", () => {
  it("returns null for a missing brush", async () => {
    expect(await readBrush("missing", opts())).toBeNull();
  });

  it("round-trips a document", async () => {
    const doc = {
      version: "brush-1",
      width: 2,
      height: 1,
      frames: [{ id: "f1", layers: [{ id: "l1", cells: [[0, [1, -2, 3, 4]]] }] }],
      appliedGroups: [],
    };
    await writeBrush("a", doc, opts());
    expect(await readBrush("a", opts())).toEqual(doc);
  });

  it("creates the base directory on first write", async () => {
    const nested = join(baseDir, "fresh", "brushes");
    await writeBrush("a", { v: 1 }, { baseDir: nested });
    expect(await readBrush("a", { baseDir: nested })).toEqual({ v: 1 });
  });

  it("writes pretty-printed JSON", async () => {
    await writeBrush("a", { v: 1 }, opts());
    const raw = await readFile(join(baseDir, "a.json"), "utf-8");
    expect(raw).toBe(JSON.stringify({ v: 1 }, null, 2));
  });

  it("does not create .prev on the first write", async () => {
    await writeBrush("a", { v: 1 }, opts());
    expect(existsSync(join(baseDir, ".prev"))).toBe(false);
  });

  it("⭐ keeps the previous content in .prev/<name>.json on overwrite", async () => {
    await writeBrush("a", { v: 1 }, opts());
    await writeBrush("a", { v: 2 }, opts());

    expect(await readBrush("a", opts())).toEqual({ v: 2 });
    const prev = JSON.parse(
      await readFile(join(baseDir, ".prev", "a.json"), "utf-8"),
    );
    expect(prev).toEqual({ v: 1 });
  });

  it("keeps only one previous copy (the most recent overwrite's predecessor)", async () => {
    await writeBrush("a", { v: 1 }, opts());
    await writeBrush("a", { v: 2 }, opts());
    await writeBrush("a", { v: 3 }, opts());

    const prev = JSON.parse(
      await readFile(join(baseDir, ".prev", "a.json"), "utf-8"),
    );
    expect(prev).toEqual({ v: 2 });
  });

  it("leaves no temp file behind after a write", async () => {
    await writeBrush("a", { v: 1 }, opts());
    expect(await listBrushes(opts())).toEqual(["a"]);
    const { readdir } = await import("fs/promises");
    const entries = await readdir(baseDir);
    expect(entries.filter((e) => e.includes(".tmp."))).toEqual([]);
  });
});

describe("brushExists", () => {
  it("is false before and true after a write", async () => {
    expect(await brushExists("a", opts())).toBe(false);
    await writeBrush("a", {}, opts());
    expect(await brushExists("a", opts())).toBe(true);
  });
});

describe("renameBrush", () => {
  it("moves the file to the new stem", async () => {
    await writeBrush("old", { v: 1 }, opts());
    await renameBrush("old", "new", opts());

    expect(await brushExists("old", opts())).toBe(false);
    expect(await readBrush("new", opts())).toEqual({ v: 1 });
    expect(await listBrushes(opts())).toEqual(["new"]);
  });

  it("throws when the source is missing", async () => {
    await expect(renameBrush("missing", "new", opts())).rejects.toThrow(
      /does not exist/,
    );
  });

  it("throws when the destination exists", async () => {
    await writeBrush("a", { v: "a" }, opts());
    await writeBrush("b", { v: "b" }, opts());
    await expect(renameBrush("a", "b", opts())).rejects.toThrow(
      /already exists/,
    );
    // Neither file was disturbed.
    expect(await readBrush("a", opts())).toEqual({ v: "a" });
    expect(await readBrush("b", opts())).toEqual({ v: "b" });
  });
});

describe("deleteBrush", () => {
  it("removes the file", async () => {
    await writeBrush("a", {}, opts());
    await deleteBrush("a", opts());
    expect(await brushExists("a", opts())).toBe(false);
    expect(await listBrushes(opts())).toEqual([]);
  });

  it("throws when the brush is missing", async () => {
    await expect(deleteBrush("missing", opts())).rejects.toThrow(
      /does not exist/,
    );
  });

  it("does not remove the .prev copy", async () => {
    // Deleting is not the same as forgetting: the previous copy stays until
    // the next overwrite of a brush with the same name replaces it.
    await writeBrush("a", { v: 1 }, opts());
    await writeBrush("a", { v: 2 }, opts());
    await deleteBrush("a", opts());
    expect(existsSync(join(baseDir, ".prev", "a.json"))).toBe(true);
  });
});

describe("name validation", () => {
  const invalid = ["../x", "config", ".hidden", ""];

  for (const name of invalid) {
    describe(`rejects ${JSON.stringify(name)}`, () => {
      it("from getBrushFilePath", () => {
        expect(() => getBrushFilePath(name, opts())).toThrow(BrushNameError);
      });

      it("from readBrush", async () => {
        await expect(readBrush(name, opts())).rejects.toThrow(BrushNameError);
      });

      it("from writeBrush", async () => {
        await expect(writeBrush(name, {}, opts())).rejects.toThrow(
          BrushNameError,
        );
      });

      it("from brushExists", async () => {
        await expect(brushExists(name, opts())).rejects.toThrow(
          BrushNameError,
        );
      });

      it("from renameBrush (either side)", async () => {
        await writeBrush("ok", {}, opts());
        await expect(renameBrush(name, "ok2", opts())).rejects.toThrow(
          BrushNameError,
        );
        await expect(renameBrush("ok", name, opts())).rejects.toThrow(
          BrushNameError,
        );
      });

      it("from deleteBrush", async () => {
        await expect(deleteBrush(name, opts())).rejects.toThrow(
          BrushNameError,
        );
      });
    });
  }

  it("rejects a non-string name", async () => {
    await expect(
      readBrush(undefined as unknown as string, opts()),
    ).rejects.toThrow(BrushNameError);
  });

  it("never writes anything for a rejected name", async () => {
    await expect(writeBrush("../x", { v: 1 }, opts())).rejects.toThrow(
      BrushNameError,
    );
    expect(existsSync(join(baseDir, "..", "x.json"))).toBe(false);
    expect(await listBrushes(opts())).toEqual([]);
  });

  it("carries the offending name on the error", () => {
    try {
      getBrushFilePath("../x", opts());
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(BrushNameError);
      expect((error as BrushNameError).brushName).toBe("../x");
    }
  });
});
