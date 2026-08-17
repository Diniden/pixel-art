/**
 * The export route — validation, orchestration, response.
 *
 * Replaces the 440-line handler that was `src/routes/export.ts:488-927`
 * (REFRESH task 11). All of the work now lives in `./index.ts`'s `runExport`.
 */

import { Router, Request, Response } from "express";

import { loadConfig } from "../backup.js";
import { isValidProjectName } from "../validation.js";
import { DEFAULT_EXPORT_FOLDER, ProjectNotFoundError, runExport } from "./index.js";

export { DEFAULT_EXPORT_FOLDER };

export const exportRouter = Router();

exportRouter.post("/project/export", async (req: Request, res: Response) => {
  try {
    const projectName =
      (req.query.name as string) || (await loadConfig()).currentProject;
    if (!projectName) {
      res.status(400).json({ error: "No project name" });
      return;
    }

    // CONTRACT FIX (task 11): before this, `req.query.name` reached
    // `toKebabCase()` → `join(exportBase, kebabName)` completely unvalidated.
    // `isValidProjectName` is the same predicate the project routes use,
    // shared via `src/validation.ts`.
    if (!isValidProjectName(projectName)) {
      res.status(400).json({ error: "Invalid project name" });
      return;
    }

    const exportBase = process.env.EXPORT_FOLDER || DEFAULT_EXPORT_FOLDER;
    const result = await runExport(projectName, exportBase);

    // NOTE: `path` is an absolute SERVER filesystem path the browser cannot
    // use, and task 11's spec proposed dropping it. It is RETAINED because
    // `client/src/components/Header/Header.tsx:97` still reads it
    // (`Exported to ${result.path}`) and task 11 may not touch `client/`.
    // The remaining fields are additive. Remove `path` in the same change that
    // removes that call site.
    res.json({
      success: true,
      path: result.path,
      kebabName: result.kebabName,
      frameCount: result.frameCount,
      textureCount: result.textureCount,
      bytes: result.bytes,
    });
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      res
        .status(404)
        .json({ error: "Project not found", projectName: error.projectName });
      return;
    }
    console.error("Export error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Export failed",
    });
  }
});
