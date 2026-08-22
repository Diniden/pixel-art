import { describe, expect, it } from "vitest";
import {
  buffersEqual,
  createBuffer,
  createStubCanvas,
  createStubContext,
  getPixel,
  hashBuffer,
  isBlank,
  parseColor,
  renderToHash,
} from "@test/canvasStub";
import type { StubContext } from "@test/canvasStub";

// Proves the harness's own load-bearing helper works. Tasks 30 and 33 rely on
// `renderToHash` to show that unifying the frame-overlay renderers and
// deduplicating the checkerboard implementations did not change pixels, so the
// helper itself needs a floor under it.
describe("canvasStub buffers", () => {
  it("allocates a zeroed RGBA buffer", () => {
    const buf = createBuffer(4, 3);
    expect(buf.data.length).toBe(4 * 3 * 4);
    expect(isBlank(buf)).toBe(true);
  });

  it("produces a stable hash that includes the dimensions", () => {
    const a = createBuffer(8, 8, [1, 2, 3, 4]);
    const b = createBuffer(8, 8, [1, 2, 3, 4]);
    expect(hashBuffer(a)).toBe(hashBuffer(b));
    expect(hashBuffer(a).startsWith("8x8:")).toBe(true);
    expect(buffersEqual(a, b)).toBe(true);
  });

  it("changes the hash when a single byte changes", () => {
    const a = createBuffer(8, 8);
    const b = createBuffer(8, 8);
    b.data[17] = 1;
    expect(hashBuffer(a)).not.toBe(hashBuffer(b));
  });

  it("distinguishes buffers of different shape holding the same bytes", () => {
    expect(hashBuffer(createBuffer(4, 8))).not.toBe(
      hashBuffer(createBuffer(8, 4)),
    );
  });
});

describe("canvasStub colour parsing", () => {
  it("parses the supported CSS colour forms", () => {
    expect(parseColor("#f00")).toEqual([255, 0, 0, 255]);
    expect(parseColor("#00ff00")).toEqual([0, 255, 0, 255]);
    expect(parseColor("#0000ff80")).toEqual([0, 0, 255, 128]);
    expect(parseColor("rgb(1, 2, 3)")).toEqual([1, 2, 3, 255]);
    expect(parseColor("rgba(1, 2, 3, 0.5)")).toEqual([1, 2, 3, 128]);
    expect(parseColor("transparent")).toEqual([0, 0, 0, 0]);
  });

  it("throws rather than silently defaulting on an unsupported colour", () => {
    expect(() => parseColor("hsl(120 50% 50%)")).toThrow(/unsupported colour/);
  });
});

describe("canvasStub 2D context", () => {
  it("rasterises fillRect exactly", () => {
    const ctx = createStubContext(4, 4);
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(1, 1, 2, 2);
    expect(getPixel(ctx.buffer, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(getPixel(ctx.buffer, 1, 1)).toEqual([255, 0, 0, 255]);
    expect(getPixel(ctx.buffer, 2, 2)).toEqual([255, 0, 0, 255]);
    expect(getPixel(ctx.buffer, 3, 3)).toEqual([0, 0, 0, 0]);
  });

  it("honours clearRect, save/restore and translate", () => {
    const ctx = createStubContext(4, 4);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 4, 4);
    ctx.save();
    ctx.translate(1, 1);
    ctx.clearRect(0, 0, 2, 2);
    ctx.restore();
    expect(getPixel(ctx.buffer, 1, 1)).toEqual([0, 0, 0, 0]);
    expect(getPixel(ctx.buffer, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(getPixel(ctx.buffer, 3, 3)).toEqual([255, 255, 255, 255]);
    // translate was popped by restore()
    ctx.clearRect(0, 0, 1, 1);
    expect(getPixel(ctx.buffer, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it("round-trips putImageData / getImageData", () => {
    const ctx = createStubContext(4, 4);
    const img = ctx.createImageData(2, 2);
    img.data.set([9, 8, 7, 255], 0);
    ctx.putImageData(img, 1, 1);
    const read = ctx.getImageData(1, 1, 2, 2);
    expect(Array.from(read.data.slice(0, 4))).toEqual([9, 8, 7, 255]);
  });

  it("composites globalAlpha over an existing pixel", () => {
    const ctx = createStubContext(1, 1);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 1, 1);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 1, 1);
    const [r, , , a] = getPixel(ctx.buffer, 0, 0);
    expect(a).toBe(255);
    expect(r).toBeGreaterThan(120);
    expect(r).toBeLessThan(136);
  });

  it("blits between stub canvases via drawImage", () => {
    const source = createStubCanvas(2, 2);
    const sctx = source.getContext("2d")!;
    sctx.fillStyle = "#00ff00";
    sctx.fillRect(0, 0, 2, 2);

    const ctx = createStubContext(4, 4);
    ctx.drawImage(source, 1, 1);
    expect(getPixel(ctx.buffer, 1, 1)).toEqual([0, 255, 0, 255]);
    expect(getPixel(ctx.buffer, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it("records path calls without rasterising them", () => {
    const ctx = createStubContext(4, 4);
    ctx.strokeStyle = "#ff0000";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(3, 3);
    ctx.stroke();
    expect(isBlank(ctx.buffer)).toBe(true);
    expect(ctx.calls.map((c) => c.method)).toEqual([
      "beginPath",
      "moveTo",
      "lineTo",
      "stroke",
    ]);
  });
});

describe("renderToHash", () => {
  it("is deterministic for the same fixture", () => {
    const checkerboard = (size: number, cell: number) => (ctx: StubContext) => {
      for (let y = 0; y < size; y += cell) {
        for (let x = 0; x < size; x += cell) {
          ctx.fillStyle =
            (x / cell + y / cell) % 2 === 0 ? "#cccccc" : "#888888";
          ctx.fillRect(x, y, cell, cell);
        }
      }
    };
    const a = renderToHash(16, 16, checkerboard(16, 4));
    const b = renderToHash(16, 16, checkerboard(16, 4));
    expect(a).toBe(b);
    // A different cell size must produce a different hash — otherwise the
    // tripwire would be useless.
    expect(renderToHash(16, 16, checkerboard(16, 8))).not.toBe(a);
  });

  it("refuses to hash a buffer the renderer never touched", () => {
    expect(() =>
      renderToHash(8, 8, (ctx) => {
        ctx.beginPath();
        ctx.arc(4, 4, 2, 0, Math.PI * 2);
        ctx.stroke();
      }),
    ).toThrow(/entirely blank/);
  });
});
