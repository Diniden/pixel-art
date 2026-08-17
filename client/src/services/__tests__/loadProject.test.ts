// DO NOT run `vitest -u` on this file. Every diff here is a change to real user data.
//
// Characterisation tests for the migration CHAIN in `services/api.ts:175-239`
// (REFRESH task 07) — the order the migrations run in and their side effects,
// not the individual transforms (those are in `types/__tests__/migrations.test.ts`).
//
// ⚠️ Assertions here are OBSERVED behaviour, bugs included. L2 and L6 pin real
// defects. L6 in particular pins the highest-severity bug in the repo.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MODERN_PIXELS,
  syntheticLayer,
  syntheticProject,
  syntheticUIState,
} from "@test/__fixtures__/projects";
import { loadProject } from "@/services/api";
import { createDefaultProject, type CompactProject } from "@/types";

/** A fetch stub that records every call in order. */
interface Call {
  url: string;
  method: string;
  body?: unknown;
}

let calls: Call[];
let consoleLog: ReturnType<typeof vi.spyOn>;
let consoleWarn: ReturnType<typeof vi.spyOn>;
let consoleError: ReturnType<typeof vi.spyOn>;

function stubFetch(
  handler: (url: string, init?: RequestInit) => Promise<unknown> | unknown,
): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return handler(String(url), init);
    }),
  );
}

function okResponse(data: unknown) {
  return { ok: true, status: 200, statusText: "OK", json: async () => data };
}

function errorResponse(status: number) {
  return {
    ok: false,
    status,
    statusText: `Status ${status}`,
    json: async () => ({}),
  };
}

/** Legacy pixel format: scalar colour hex, no `[c,n,h]` tuples. */
function legacyPixelProject(): CompactProject {
  const p = syntheticProject([
    syntheticLayer("l0", [
      [0, 0xff_00_00_ff],
      [0, 0],
    ]),
  ]);
  return p;
}

/** Modern pixel format with object-level variantGroups awaiting M6. */
function objectVariantProject(): CompactProject {
  return {
    version: "1.1.0",
    objects: [
      {
        id: "o1",
        name: "Object 1",
        gridSize: { width: 2, height: 2 },
        variantGroups: [
          {
            id: "vg1",
            name: "Head",
            variants: [
              {
                id: "v1",
                name: "Variant 1",
                gridSize: { width: 2, height: 2 },
                frames: [
                  {
                    id: "vf0",
                    layers: [syntheticLayer("vf0-l0", MODERN_PIXELS)],
                  },
                ],
                baseFrameOffsets: { 0: { x: 1, y: 2 } },
              },
            ],
          },
        ],
        frames: [
          {
            id: "o1-f0",
            name: "Frame 0",
            layers: [syntheticLayer("o1-f0-l0", MODERN_PIXELS)],
          },
        ],
      },
    ],
    palettes: [{ id: "pal", name: "Palette", colors: [0] }],
    uiState: syntheticUIState(),
  };
}

/** Modern pixels, project-level variants — nothing to migrate. */
function cleanProject(): CompactProject {
  return syntheticProject([syntheticLayer("l0", MODERN_PIXELS)], {
    variants: [],
  });
}

const backupCalls = () => calls.filter((c) => c.url.includes("/project/backup"));

beforeEach(() => {
  calls = [];
  consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  consoleLog.mockRestore();
  consoleWarn.mockRestore();
  consoleError.mockRestore();
});

describe("L1 — backup fires BEFORE any migration", () => {
  it("POSTs the UNMIGRATED payload to /api/project/backup first", async () => {
    const legacy = legacyPixelProject();
    stubFetch((url) =>
      url.includes("/project/backup")
        ? okResponse({ ok: true })
        : okResponse(legacy),
    );

    await loadProject();

    // Order: GET the project, then POST the backup.
    expect(calls[0].method).toBe("GET");
    expect(calls[1].method).toBe("POST");
    expect(calls[1].url).toContain("/project/backup");

    // And the body is the payload as it was BEFORE migration — the legacy
    // scalar pixel is still a scalar. This is what makes the backup useful.
    const body = calls[1].body as CompactProject;
    expect(body.objects[0].frames[0].layers[0].pixels[0][1]).toBe(0xff_00_00_ff);
  });
});

describe("L2 — a failing backup does NOT block the migration", () => {
  it("proceeds with the migration and returns a loaded project anyway", async () => {
    // BUG: the backup is best-effort — `api.ts:208-217` wraps the POST in its
    // own try/catch and only `console.warn`s on failure. If the backup cannot
    // be written (full disk, server down, permissions), the migration still
    // runs and the migrated result is what the store will auto-save over the
    // original file. The safety net silently is not there.
    //
    // PINNED DELIBERATELY. No task in the REFRESH plan makes the backup
    // blocking — that is a product decision, not a bug fix (a user with a full
    // disk could then not open their project at all), and it is filed as a
    // follow-up. Changing it requires owner sign-off.
    const legacy = legacyPixelProject();
    stubFetch((url) => {
      if (url.includes("/project/backup")) return Promise.reject(new Error("disk full"));
      return okResponse(legacy);
    });

    const result = await loadProject();

    expect(backupCalls()).toHaveLength(1);
    expect(consoleWarn).toHaveBeenCalledWith(
      "Could not create backup:",
      expect.any(Error),
    );
    // Migration ran regardless: the scalar pixel became a [c,n,h] tuple and
    // decoded to a real colour.
    expect(result.objects[0].frames[0].layers[0].pixels[0][1]).toEqual({
      color: { r: 255, g: 0, b: 0, a: 255 },
      normal: 0,
      height: 1,
    });
  });
});

describe("L3 — legacy pixel format takes the migrateLegacyProject branch only", () => {
  it("runs the legacy migration and NOT migrateVariantsToProjectLevel", async () => {
    // `api.ts:221-227` is an if / else-if, so the two never both run.
    // `migrateLegacyProject` handles variants itself.
    const legacy = legacyPixelProject();
    legacy.objects[0].variantGroups = objectVariantProject().objects[0].variantGroups;

    stubFetch((url) =>
      url.includes("/project/backup")
        ? okResponse({ ok: true })
        : okResponse(legacy),
    );

    const result = await loadProject();

    expect(consoleLog).toHaveBeenCalledWith(
      "Migrating legacy project to new format with lighting data...",
    );
    expect(consoleLog).not.toHaveBeenCalledWith(
      "Migrating variant groups from objects to project level...",
    );
    // The legacy path hoisted the variants itself.
    expect(result.variants?.map((v) => v.id)).toEqual(["vg1"]);
    // Pixels were migrated.
    expect(result.objects[0].frames[0].layers[0].pixels[0][1]).toEqual({
      color: { r: 255, g: 0, b: 0, a: 255 },
      normal: 0,
      height: 1,
    });
  });
});

describe("L4 — modern pixels + object-level variants", () => {
  it("runs ONLY migrateVariantsToProjectLevel", async () => {
    stubFetch((url) =>
      url.includes("/project/backup")
        ? okResponse({ ok: true })
        : okResponse(objectVariantProject()),
    );

    const result = await loadProject();

    expect(consoleLog).toHaveBeenCalledWith(
      "Migrating variant groups from objects to project level...",
    );
    expect(consoleLog).not.toHaveBeenCalledWith(
      "Migrating legacy project to new format with lighting data...",
    );
    expect(backupCalls()).toHaveLength(1);
    expect(result.variants?.map((v) => v.id)).toEqual(["vg1"]);
  });
});

describe("L5 — nothing to migrate", () => {
  it("makes no backup POST at all", async () => {
    stubFetch(() => okResponse(cleanProject()));

    const result = await loadProject();

    expect(backupCalls()).toHaveLength(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(result.objects).toHaveLength(1);
  });
});

describe("L6 — fetch throws", () => {
  it("returns a BLANK createDefaultProject() and only logs", async () => {
    // BUG: HIGHEST-SEVERITY DEFECT IN THE REPO.
    //
    // `loadProject`'s outer try/catch (`api.ts:234-238`) swallows EVERY failure
    // — network error, malformed JSON, a throw from any migration — and returns
    // `createDefaultProject()`: a blank one-object, one-frame project. The store
    // accepts that as the loaded project, and the auto-save chain then writes it
    // back over the user's real file. A transient network blip can therefore
    // replace 1.1 MB of real artwork with an empty default, with nothing in the
    // UI to indicate anything went wrong.
    //
    // Task 14 fixes this. Until then it is pinned so the behaviour is
    // verifiable rather than merely suspected.
    stubFetch(() => {
      throw new Error("network down");
    });

    const result = await loadProject();

    expect(result).toEqual(createDefaultProject());
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].frames).toHaveLength(1);
    expect(consoleError).toHaveBeenCalledWith(
      "Error loading project:",
      expect.any(Error),
    );
    // Nothing signals the failure to the caller — no throw, no error field.
    expect(result.version).toBe("1.1.0");
  });

  it("also swallows a non-404 HTTP error the same way", async () => {
    // BUG: same defect via a different route — a 500 becomes a blank project.
    // Task 14 fixes it.
    stubFetch(() => errorResponse(500));

    const result = await loadProject();

    expect(result).toEqual(createDefaultProject());
    expect(consoleError).toHaveBeenCalled();
  });

  it("swallows malformed JSON the same way", async () => {
    // BUG: same defect. A truncated or corrupt project file yields a blank
    // default rather than an error. Task 14 fixes it.
    stubFetch(() => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    }));

    const result = await loadProject();

    expect(result).toEqual(createDefaultProject());
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("L7 — 404", () => {
  it("returns createDefaultProject() WITHOUT a backup POST and without logging an error", async () => {
    stubFetch(() => errorResponse(404));

    const result = await loadProject();

    expect(result).toEqual(createDefaultProject());
    expect(backupCalls()).toHaveLength(0);
    expect(calls).toHaveLength(1);
    // 404 is the legitimate "no project yet" path (`api.ts:183-186`), so unlike
    // L6 it returns before the catch and logs nothing.
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("L8 — isCompactFormat === false", () => {
  it("returns the payload RAW as a Project with no conversion", async () => {
    // `api.ts:232-233`. An expanded-format file is handed back untouched: no
    // migration, no defaulting, no hex→rgba conversion. Whatever shape the file
    // had is what the store receives.
    const expanded = {
      version: "0.9.0",
      objects: [{ id: "raw", name: "Raw", gridSize: { width: 1, height: 1 }, frames: [] }],
      palettes: [{ id: "p", name: "P", colors: [{ r: 1, g: 2, b: 3, a: 4 }] }],
      uiState: { selectedColor: { r: 1, g: 2, b: 3, a: 4 }, marker: "untouched" },
    };
    stubFetch(() => okResponse(expanded));

    const result = (await loadProject()) as unknown as typeof expanded;

    expect(result).toEqual(expanded);
    expect(result.uiState.marker).toBe("untouched");
    expect(result.version).toBe("0.9.0");
    expect(backupCalls()).toHaveLength(0);
  });
});

describe("project name handling", () => {
  it("URL-encodes the project name into the query string", async () => {
    stubFetch(() => okResponse(cleanProject()));
    await loadProject("Base Unit");
    expect(calls[0].url).toContain("name=Base%20Unit");
  });

  it("omits the query string entirely when no name is given", async () => {
    stubFetch(() => okResponse(cleanProject()));
    await loadProject();
    expect(calls[0].url).not.toContain("name=");
  });
});
