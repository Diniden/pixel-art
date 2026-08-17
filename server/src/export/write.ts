/**
 * Filesystem side of the export: frames.json, its gzip, and the lib/ copy.
 *
 * Moved VERBATIM from `src/routes/export.ts:692-718` (REFRESH task 11).
 *
 * ⚠️ `createGzip({ level: 9 })` is part of the published artefact. Changing the
 * level changes `frames.json.gz`'s bytes even though it inflates to the same
 * JSON.
 */

import { createWriteStream, existsSync } from "fs";
import { cp } from "fs/promises";
import { join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { createGzip } from "zlib";

import { safeWriteFile } from "../backup.js";

/**
 * Write `frames.json` and `frames.json.gz` into the export directory.
 *
 * Returns the byte length of the uncompressed JSON.
 */
export async function writeFrames(
  projectExportDir: string,
  framesJsonStr: string,
): Promise<number> {
  const framesPath = join(projectExportDir, "frames.json");
  await safeWriteFile(framesPath, framesJsonStr);

  const framesGzPath = join(projectExportDir, "frames.json.gz");
  await pipeline(
    Readable.from([framesJsonStr]),
    createGzip({ level: 9 }),
    createWriteStream(framesGzPath),
  );

  return Buffer.byteLength(framesJsonStr, "utf8");
}

/**
 * Copy `client/lib` to the exports root.
 *
 * ⚠️ `server/exports/lib/` is consumed VERBATIM by external game code
 * (OPEN-QUESTIONS.md Q33). Its published format may not change without a
 * coordinated version bump and owner sign-off. This copy must stay a plain
 * recursive copy — do not transform, format, or filter the files.
 */
export async function copyClientLib(
  clientLibDir: string,
  exportBase: string,
): Promise<void> {
  const libDestDir = join(exportBase, "lib");
  if (existsSync(clientLibDir)) {
    await cp(clientLibDir, libDestDir, { recursive: true, force: true });
  }
}

/** Write the generated `index.ts` into the export directory. */
export async function writeIndexTs(
  projectExportDir: string,
  indexTs: string,
): Promise<void> {
  const indexPath = join(projectExportDir, "index.ts");
  await safeWriteFile(indexPath, indexTs);
}
