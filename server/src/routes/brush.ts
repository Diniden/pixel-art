/**
 * Brush document routes (brush-studio task 02, MASTER D13).
 *
 *   GET    /api/brushes            → { brushes: string[] }
 *   GET    /api/brush?name=        → the raw document          400 / 404
 *   POST   /api/brush?name=        → { success: true }          400
 *   POST   /api/brush/create       → { success: true, name }    400 / 409
 *   POST   /api/brush/rename       → { success: true }          400 / 404 / 409
 *   DELETE /api/brush?name=        → { success: true }          400 / 404
 *
 * Mirrors `routes/project.ts` — same status codes, same `{ error }` shape —
 * minus the config, backup and sync concerns, which brushes do not have
 * (MASTER D12: no rotation, no cross-tab broadcast).
 *
 * Every handler is wrapped in try/catch and answers 500 `{ error }` on an
 * unexpected failure. No request ever returns 200 with an error payload.
 */
import { Router, Request, Response } from "express";
import {
  BrushNameError,
  brushExists,
  deleteBrush,
  listBrushes,
  readBrush,
  renameBrush,
  writeBrush,
} from "../brushFiles.js";
import { isValidProjectName } from "../validation.js";

export const brushRouter = Router();

/**
 * Document written by `create` when the caller sends no `brushData`. The
 * server does not know the brush type; the client normalises on load. Shape
 * per MASTER D2.
 */
const EMPTY_BRUSH_DOCUMENT = {
  version: "brush-1",
  width: 16,
  height: 16,
  frames: [],
  appliedGroups: [],
} as const;

const INVALID_NAME = { error: "Invalid brush name" } as const;

function queryName(req: Request): string | undefined {
  const { name } = req.query;
  return typeof name === "string" ? name : undefined;
}

/** A brush document is a JSON object — not null, not an array, not a scalar. */
function isDocumentObject(body: unknown): body is Record<string, unknown> {
  return typeof body === "object" && body !== null && !Array.isArray(body);
}

/**
 * Map a thrown error to a response. `BrushNameError` is a caller mistake
 * (400); anything else is a genuine failure (500). Never fabricate success.
 */
function sendError(
  res: Response,
  error: unknown,
  context: string,
  fallback: string,
): void {
  if (error instanceof BrushNameError) {
    res.status(400).json(INVALID_NAME);
    return;
  }
  console.error(`Error ${context}:`, error);
  res.status(500).json({ error: fallback });
}

// GET /api/brushes - List all brushes
brushRouter.get("/brushes", async (_req: Request, res: Response) => {
  try {
    const brushes = await listBrushes();
    res.json({ brushes });
  } catch (error) {
    sendError(res, error, "listing brushes", "Failed to list brushes");
  }
});

// GET /api/brush?name= - Load a brush document
brushRouter.get("/brush", async (req: Request, res: Response) => {
  try {
    const name = queryName(req);
    if (!name || !isValidProjectName(name)) {
      res.status(400).json(INVALID_NAME);
      return;
    }

    const document = await readBrush(name);
    if (document === null) {
      res.status(404).json({ error: "No brush found", name });
      return;
    }

    res.json(document);
  } catch (error) {
    sendError(res, error, "loading brush", "Failed to load brush");
  }
});

// POST /api/brush?name= - Save a brush document (previous copy + safe write)
brushRouter.post("/brush", async (req: Request, res: Response) => {
  try {
    const name = queryName(req);
    if (!name || !isValidProjectName(name)) {
      res.status(400).json(INVALID_NAME);
      return;
    }

    const document: unknown = req.body;
    if (!isDocumentObject(document)) {
      res.status(400).json({ error: "Invalid brush data" });
      return;
    }

    await writeBrush(name, document);
    res.json({ success: true });
  } catch (error) {
    sendError(res, error, "saving brush", "Failed to save brush");
  }
});

// POST /api/brush/create - Create a new brush
brushRouter.post("/brush/create", async (req: Request, res: Response) => {
  try {
    const body: unknown = req.body;
    const name = isDocumentObject(body) ? body.name : undefined;
    const brushData = isDocumentObject(body) ? body.brushData : undefined;

    if (typeof name !== "string" || !isValidProjectName(name)) {
      res.status(400).json(INVALID_NAME);
      return;
    }

    if (brushData !== undefined && !isDocumentObject(brushData)) {
      res.status(400).json({ error: "Invalid brush data" });
      return;
    }

    if (await brushExists(name)) {
      res.status(409).json({ error: "Brush already exists" });
      return;
    }

    await writeBrush(name, brushData ?? EMPTY_BRUSH_DOCUMENT);
    res.json({ success: true, name });
  } catch (error) {
    sendError(res, error, "creating brush", "Failed to create brush");
  }
});

// POST /api/brush/rename - Rename a brush
brushRouter.post("/brush/rename", async (req: Request, res: Response) => {
  try {
    const body: unknown = req.body;
    const oldName = isDocumentObject(body) ? body.oldName : undefined;
    const newName = isDocumentObject(body) ? body.newName : undefined;

    if (
      typeof oldName !== "string" ||
      typeof newName !== "string" ||
      !isValidProjectName(oldName) ||
      !isValidProjectName(newName)
    ) {
      res.status(400).json(INVALID_NAME);
      return;
    }

    if (!(await brushExists(oldName))) {
      res.status(404).json({ error: "Brush not found" });
      return;
    }

    if (await brushExists(newName)) {
      res.status(409).json({ error: "A brush with that name already exists" });
      return;
    }

    await renameBrush(oldName, newName);
    res.json({ success: true });
  } catch (error) {
    sendError(res, error, "renaming brush", "Failed to rename brush");
  }
});

// DELETE /api/brush?name= - Delete a brush
brushRouter.delete("/brush", async (req: Request, res: Response) => {
  try {
    const name = queryName(req);
    if (!name || !isValidProjectName(name)) {
      res.status(400).json(INVALID_NAME);
      return;
    }

    if (!(await brushExists(name))) {
      res.status(404).json({ error: "Brush not found" });
      return;
    }

    await deleteBrush(name);
    res.json({ success: true });
  } catch (error) {
    sendError(res, error, "deleting brush", "Failed to delete brush");
  }
});
