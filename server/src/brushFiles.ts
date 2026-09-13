/**
 * Brush document file helpers (brush-studio task 02, MASTER D12).
 *
 * Brushes are stored as `server/src/data/brushes/<name>.json`. They live in a
 * SUBDIRECTORY of `DATA_DIR` on purpose: `listProjects()` in `backup.ts`
 * filters a flat `readdir(DATA_DIR)` on the `.json` suffix, so a brush placed
 * beside the project files would show up in `GET /api/projects` as a project.
 * A directory entry never ends in `.json`, so `brushes/` is invisible to it.
 *
 * Before every overwrite the current file is copied to
 * `<baseDir>/.prev/<name>.json` — a one-deep "previous version", no rotation.
 *
 * Every function is parameterised on `baseDir` so the test-suite can point it
 * at a `mkdtemp` directory. Agents cannot read `server/src/data/**` and tests
 * must never write there.
 *
 * Atomic writes are `safeWriteFile` from `backup.ts` (temp file → write → read
 * back & compare → rename). Do not reimplement them here.
 */
import { readFile, readdir, rename, unlink, copyFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { DATA_DIR, ensureDir, safeWriteFile } from "./backup.js";
import { isValidProjectName } from "./validation.js";

export const BRUSHES_DIR = join(DATA_DIR, "brushes");

/** Name of the sibling directory holding the one-deep previous copies. */
const PREV_DIR_NAME = ".prev";

export interface BrushFilesOptions {
  /** Directory holding `<name>.json` files. Defaults to `BRUSHES_DIR`. */
  baseDir?: string;
}

/**
 * Thrown by every helper that takes a brush name when the name fails
 * `isValidProjectName` — the same path-traversal guard the project routes use.
 * The route layer maps this to a 400.
 */
export class BrushNameError extends Error {
  readonly name = "BrushNameError";

  constructor(public readonly brushName: unknown) {
    super(`Invalid brush name: ${JSON.stringify(brushName)}`);
  }
}

function resolveBaseDir(opts?: BrushFilesOptions): string {
  return opts?.baseDir ?? BRUSHES_DIR;
}

function assertBrushName(name: unknown): asserts name is string {
  if (typeof name !== "string" || !isValidProjectName(name)) {
    throw new BrushNameError(name);
  }
}

/** `<baseDir>/<name>.json`. Throws `BrushNameError` on an invalid name. */
export function getBrushFilePath(
  name: string,
  opts?: BrushFilesOptions,
): string {
  assertBrushName(name);
  return join(resolveBaseDir(opts), `${name}.json`);
}

/** `<baseDir>/.prev/<name>.json`. Throws `BrushNameError` on an invalid name. */
export function getBrushPrevFilePath(
  name: string,
  opts?: BrushFilesOptions,
): string {
  assertBrushName(name);
  return join(resolveBaseDir(opts), PREV_DIR_NAME, `${name}.json`);
}

/**
 * Sorted brush name stems. Only regular `*.json` files count — the `.prev`
 * directory, stray non-JSON files and subdirectories are ignored. A missing
 * base directory is an empty library, not an error.
 */
export async function listBrushes(opts?: BrushFilesOptions): Promise<string[]> {
  const baseDir = resolveBaseDir(opts);
  if (!existsSync(baseDir)) return [];

  const entries = await readdir(baseDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.slice(0, -".json".length))
    .filter((stem) => isValidProjectName(stem))
    .sort();
}

export async function brushExists(
  name: string,
  opts?: BrushFilesOptions,
): Promise<boolean> {
  return existsSync(getBrushFilePath(name, opts));
}

/** Parsed document, or `null` when no such brush exists. */
export async function readBrush(
  name: string,
  opts?: BrushFilesOptions,
): Promise<unknown | null> {
  const filePath = getBrushFilePath(name, opts);
  if (!existsSync(filePath)) return null;

  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as unknown;
}

/**
 * Write a brush document. If the file already exists its current bytes are
 * first copied to `.prev/<name>.json` (overwriting any older previous copy),
 * then the new content is written atomically via `safeWriteFile`.
 */
export async function writeBrush(
  name: string,
  content: unknown,
  opts?: BrushFilesOptions,
): Promise<void> {
  const filePath = getBrushFilePath(name, opts);
  await ensureDir(resolveBaseDir(opts));

  if (existsSync(filePath)) {
    const prevPath = getBrushPrevFilePath(name, opts);
    await ensureDir(join(resolveBaseDir(opts), PREV_DIR_NAME));
    await copyFile(filePath, prevPath);
  }

  await safeWriteFile(filePath, JSON.stringify(content, null, 2));
}

/**
 * Rename `<oldName>.json` → `<newName>.json`. Throws when the source is
 * missing or the destination already exists; the route checks both first and
 * answers 404/409, so reaching these throws from a route is a 500.
 */
export async function renameBrush(
  oldName: string,
  newName: string,
  opts?: BrushFilesOptions,
): Promise<void> {
  const oldPath = getBrushFilePath(oldName, opts);
  const newPath = getBrushFilePath(newName, opts);

  if (!existsSync(oldPath)) {
    throw new Error(`Brush "${oldName}" does not exist`);
  }
  if (existsSync(newPath)) {
    throw new Error(`Brush "${newName}" already exists`);
  }

  await rename(oldPath, newPath);
}

/** Delete `<name>.json`. Throws when the brush does not exist. */
export async function deleteBrush(
  name: string,
  opts?: BrushFilesOptions,
): Promise<void> {
  const filePath = getBrushFilePath(name, opts);

  if (!existsSync(filePath)) {
    throw new Error(`Brush "${name}" does not exist`);
  }

  await unlink(filePath);
}
