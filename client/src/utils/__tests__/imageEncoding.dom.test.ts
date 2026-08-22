/**
 * `encodeImageToBase64` / `decodeBase64ToImage` (REFRESH task 29, step 2).
 *
 * ⚠️ A `.dom.test.ts` on purpose — both functions touch real DOM constructors
 * (`document.createElement("canvas")`, `new Image()`), so they cannot run in
 * the `unit` lane's node environment.
 *
 * ⚠️ AND jsdom HAS NO CANVAS (see `src/test/canvasStub.ts`'s header):
 * `canvas.getContext("2d")` returns `null` there. That is not an obstacle to
 * testing these two — it is the single most important behaviour to pin, because
 * the null-context path is the one that decides whether a failure SURFACES or
 * corrupts the saved project. `saveReferenceImageToProject` awaits this
 * promise, so a silent resolve here would write a broken `referenceImage`.
 */
import { describe, expect, it } from "vitest";
import {
  decodeBase64ToImage,
  encodeImageToBase64,
} from "@/utils/imageEncoding";

// A 1x1 transparent PNG — small, real, and decodable by anything that decodes
// PNGs at all.
const ONE_PX_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("encodeImageToBase64", () => {
  it("REJECTS rather than resolving when no 2D context is available", async () => {
    // jsdom's canvas has no context. Pinning the rejection proves the failure
    // is propagated to the caller instead of resolving with a bad value — the
    // difference between "the reference image did not save" and "the project
    // file now holds garbage".
    const img = new Image();
    await expect(encodeImageToBase64(img)).rejects.toThrow(
      "Could not get canvas context",
    );
  });
});

describe("decodeBase64ToImage", () => {
  it("assigns the data URL to the image's src verbatim", () => {
    // ⚠️ MEASURED: jsdom NEVER FIRES `onload` for a data: URL — it has no image
    // decoder, so the promise this function returns simply never settles in
    // this environment. Awaiting it here would hang the suite until the test
    // timeout (measured: it did).
    //
    // What IS observable, and what actually matters, is the assignment: the
    // restore path keeps the SAME base64 string as `ReferenceUIStore.imageUrl`,
    // and `handleClearImage` branches on its `data:` prefix to decide whether
    // to call `URL.revokeObjectURL` — revoking a data URL would be a bug. So
    // the round trip is pinned as far as this environment can observe it, and
    // the decode itself is covered by manual check 1 (a project with a saved
    // reference image shows it on startup).
    let assigned: string | null = null;
    class ProbeImage {
      onload: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      set src(value: string) {
        assigned = value;
      }
      get src(): string {
        return assigned ?? "";
      }
    }
    const original = globalThis.Image;
    // @ts-expect-error — swapping the constructor for a probe.
    globalThis.Image = ProbeImage;
    try {
      void decodeBase64ToImage(ONE_PX_PNG);
    } finally {
      globalThis.Image = original;
    }

    expect(assigned).toBe(ONE_PX_PNG);
    expect(assigned!.startsWith("data:")).toBe(true);
  });

  it("rejects when the image element reports an error", async () => {
    // The failure path the restore flow depends on: a corrupt base64 blob must
    // REJECT so `DomainStore.restoreReferenceImageFromProject` can catch it and
    // degrade to "no reference image" rather than breaking project load.
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.(new Error("decode failed")));
      }
    }
    const original = globalThis.Image;
    // @ts-expect-error — swapping the constructor for a probe.
    globalThis.Image = FailingImage;
    try {
      await expect(
        decodeBase64ToImage("data:image/png;base64,zzz"),
      ).rejects.toBeDefined();
    } finally {
      globalThis.Image = original;
    }
  });
});
