/**
 * Shared story fixtures for the AIInterpolate components (REFRESH task 34).
 *
 * ⚠️ This file exists so the 9 stories can show REAL images without importing
 * a store, an encoder that needs a canvas, or the owner's project data. It
 * builds base64 PNGs BY HAND — a minimal, valid, uncompressed PNG encoder —
 * because:
 *
 *  - `ui/utils/frameEncoding` needs `canvas.toDataURL`, which works in a
 *    browser but couples the stories to a rendering path they are not testing;
 *  - `Base64Thumbnail` takes base64 and nothing else, so base64 is the honest
 *    fixture type;
 *  - grids may never cross into `ui/` as props (R2), and these never do.
 *
 * The PNGs are real: stored (uncompressed) deflate blocks plus correct CRC32s,
 * so a browser decodes them. Small enough that the whole strip is a few KB.
 */

/* ── a tiny, dependency-free PNG writer ──────────────────────────────────── */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++)
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function u32(value: number): number[] {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

function chunk(type: string, data: number[]): number[] {
  const typeBytes = [...type].map((ch) => ch.charCodeAt(0));
  const body = new Uint8Array([...typeBytes, ...data]);
  return [...u32(data.length), ...body, ...u32(crc32(body))];
}

function toBase64(bytes: number[]): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  // Browser and Storybook both have `btoa`; this file only runs there.
  return btoa(binary);
}

/**
 * Encode an RGBA grid as a base64 PNG body (no `data:` prefix) — the exact
 * shape `Base64Thumbnail` and `SyncedAnimatedPreview` consume.
 */
export function encodeRgbaToPngBase64(
  width: number,
  height: number,
  rgba: (x: number, y: number) => [number, number, number, number],
): string {
  // Raw scanlines, each prefixed with filter type 0.
  const raw: number[] = [];
  for (let y = 0; y < height; y++) {
    raw.push(0);
    for (let x = 0; x < width; x++) raw.push(...rgba(x, y));
  }
  const rawBytes = new Uint8Array(raw);

  // zlib stream with STORED deflate blocks — no compressor needed.
  const z: number[] = [0x78, 0x01];
  const MAX = 65535;
  for (let off = 0; off < rawBytes.length; off += MAX) {
    const len = Math.min(MAX, rawBytes.length - off);
    const last = off + len >= rawBytes.length ? 1 : 0;
    z.push(
      last,
      len & 0xff,
      (len >>> 8) & 0xff,
      ~len & 0xff,
      (~len >>> 8) & 0xff,
    );
    for (let i = 0; i < len; i++) z.push(rawBytes[off + i]);
  }
  z.push(...u32(adler32(rawBytes)));

  const png = [
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk("IHDR", [...u32(width), ...u32(height), 8, 6, 0, 0, 0]),
    ...chunk("IDAT", z),
    ...chunk("IEND", []),
  ];
  return toBase64(png);
}

/* ── the sprites the stories show ────────────────────────────────────────── */

const SIZE = 16;

/**
 * A little ball that moves left→right and bobs as `t` goes 0→1 — enough motion
 * that an interpolated sequence visibly reads as an animation.
 */
export function ballFrame(t: number): string {
  const cx = 3 + t * 10;
  const cy = 8 - Math.sin(t * Math.PI) * 3;
  const hue = 200 + t * 120;
  return encodeRgbaToPngBase64(SIZE, SIZE, (x, y) => {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d > 3.2) return [0, 0, 0, 0];
    const shade = 1 - d / 4;
    const [r, g, b] = hslToRgb(hue / 360, 0.65, 0.35 + shade * 0.3);
    return [r, g, b, 255];
  });
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return [f(0), f(8), f(4)];
}

/** Eight source frames — the strip a user picks keyframes from. */
export const FRAME_THUMBNAILS: string[] = Array.from({ length: 8 }, (_, i) =>
  ballFrame(i / 7),
);

/** A denser generated run between two keyframes. */
export const GENERATED_FRAMES: string[] = Array.from({ length: 3 }, (_, i) =>
  ballFrame((i + 1) / 4),
);
