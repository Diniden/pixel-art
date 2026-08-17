/**
 * Export orchestration.
 *
 * `runExport` is the body of the old 440-line route handler
 * (`src/routes/export.ts:488-927`), with every extracted block replaced by a
 * call into the module it moved to. The SEQUENCE is unchanged and must stay
 * unchanged — see the ordering warnings in `transform.ts`.
 *
 * ⚠️ The export output is covered by a byte-identity gate. W2b proved this path
 * is byte-fragile: a sharp minor upgrade changed 214 of 232 PNGs without
 * changing a single decoded pixel. Re-export and `diff -r` against goldens
 * after any change here.
 */

import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { ensureDir, getProjectFilePath } from "../backup.js";
import { collectStrings, toCompactExport } from "./compactExport.js";
import { generateIndexTs } from "./codegen.js";
import type { CompactProject, ExportedProject, ExportResult } from "./exportTypes.js";
import { applyMaxCanvas } from "./maxCanvas.js";
import { toKebabCase, toPascalCase } from "./naming.js";
import {
  TextureRegistry,
  buildFinalObjects,
  buildFinalVariantLayers,
} from "./transform.js";
import { copyClientLib, writeFrames, writeIndexTs } from "./write.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// NOTE: this module now lives one directory deeper than the old
// `src/routes/export.ts`, so the `..` hops are adjusted to resolve to the SAME
// absolute directories. Verified against the golden export.
export const DEFAULT_EXPORT_FOLDER = join(__dirname, "..", "..", "exports");
const CLIENT_LIB_DIR = join(__dirname, "..", "..", "..", "client", "lib");

/** Raised when the named project has no file on disk. */
export class ProjectNotFoundError extends Error {
  constructor(readonly projectName: string) {
    super("Project not found");
    this.name = "ProjectNotFoundError";
  }
}

/**
 * Run a full export of `projectName` into `exportBase`.
 *
 * Throws `ProjectNotFoundError` if the project file does not exist.
 */
export async function runExport(
  projectName: string,
  exportBase: string,
): Promise<ExportResult> {
  const projectPath = getProjectFilePath(projectName);
  if (!existsSync(projectPath)) {
    throw new ProjectNotFoundError(projectName);
  }

  const kebabName = toKebabCase(projectName);
  const pascalName = toPascalCase(projectName);
  const projectExportDir = join(exportBase, kebabName);
  const texturesSubdir = join(projectExportDir, "textures");
  await ensureDir(texturesSubdir);

  const raw = await readFile(projectPath, "utf-8");
  const project: CompactProject = JSON.parse(raw);

  // Rasterise + deduplicate textures. Objects BEFORE variant layers — the
  // traversal order fixes the texture map's key order, which fixes the string
  // table, which is emitted as integers in frames.json.
  const registry = new TextureRegistry(texturesSubdir);
  const finalObjects = buildFinalObjects(project, registry);
  const finalVariantLayers = buildFinalVariantLayers(project, registry);

  await registry.flush();

  // Compute maxCanvas for each object (mutates finalObjects in place).
  applyMaxCanvas(finalObjects, finalVariantLayers);

  const exportedProject: ExportedProject = {
    version: project.version ?? "1.0.0",
    projectName,
    objects: finalObjects,
    variantLayers: finalVariantLayers,
    textures: registry.textures,
  };

  const { stringTable, str2idx } = collectStrings(exportedProject);
  const compactRoot = toCompactExport(exportedProject, stringTable, str2idx);
  const framesJsonStr = JSON.stringify(compactRoot);

  const bytes = await writeFrames(projectExportDir, framesJsonStr);

  await copyClientLib(CLIENT_LIB_DIR, exportBase);

  const indexTs = generateIndexTs({
    projectName,
    kebabName,
    pascalName,
    projectVersion: exportedProject.version,
    finalObjects,
    finalVariantLayers,
  });
  await writeIndexTs(projectExportDir, indexTs);

  const frameCount = finalObjects.reduce(
    (sum, obj) => sum + obj.frames.length,
    0,
  );

  return {
    kebabName,
    path: projectExportDir,
    frameCount,
    textureCount: registry.count,
    bytes,
  };
}
