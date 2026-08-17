/**
 * Codegen for the exported project's `index.ts`.
 *
 * Moved VERBATIM from `src/routes/export.ts:720-918` (REFRESH task 11).
 *
 * ⚠️ THE TEMPLATE LITERAL BELOW IS PUBLISHED SOURCE. The generated `index.ts`
 * is public API for downstream game code (OPEN-QUESTIONS.md Q33), and it is
 * covered by the byte-identity gate. Every space, newline and box-drawing
 * character inside the template is part of the output — reformatting the
 * template reformats the artefact. Do not let a formatter touch it.
 *
 * Note the `export` keywords inside the template are part of the GENERATED
 * source; they are not exports of this module.
 */

import type {
  ExportedObject,
  ExportedVariantLayerDef,
} from "./exportTypes.js";

export interface CodegenInput {
  projectName: string;
  kebabName: string;
  pascalName: string;
  projectVersion: string;
  finalObjects: ExportedObject[];
  finalVariantLayers: ExportedVariantLayerDef[];
}

export function generateIndexTs({
  projectName,
  kebabName,
  pascalName,
  projectVersion,
  finalObjects,
  finalVariantLayers,
}: CodegenInput): string {
  const className = `${pascalName}Pixels`;

  // Build variant layer lookup: id -> { layerName, variants: Map<variantId, variantName> }
  const vlLookup = new Map<
    string,
    { name: string; variants: Map<string, string> }
  >();
  for (const vl of finalVariantLayers) {
    const varMap = new Map<string, string>();
    for (const v of vl.variants) {
      varMap.set(v.id, v.name);
    }
    vlLookup.set(vl.id, { name: vl.name, variants: varMap });
  }

  // For each object, discover which variant layers it uses and which
  // specific variants appear (from selectedVariantId + variantOffsets keys)
  const perObjectVariants = new Map<string, Map<string, Set<string>>>();
  for (const obj of finalObjects) {
    // layerName -> Set<variantName>
    const objLayers = new Map<string, Set<string>>();

    for (const frame of obj.frames) {
      for (const layer of frame.layers) {
        if (!layer.isVariant || !layer.variantLayerId) continue;
        const vlInfo = vlLookup.get(layer.variantLayerId);
        if (!vlInfo) continue;

        if (!objLayers.has(vlInfo.name)) {
          objLayers.set(vlInfo.name, new Set());
        }
        const variantNames = objLayers.get(vlInfo.name)!;

        // Collect from selectedVariantId
        if (layer.selectedVariantId) {
          const vName = vlInfo.variants.get(layer.selectedVariantId);
          if (vName) variantNames.add(vName);
        }

        // Collect from variantOffsets keys (these are variant IDs)
        if (layer.variantOffsets) {
          for (const vid of Object.keys(layer.variantOffsets)) {
            const vName = vlInfo.variants.get(vid);
            if (vName) variantNames.add(vName);
          }
        }
      }
    }

    perObjectVariants.set(obj.name, objLayers);
  }

  // Build OBJECTS map: { name: id }
  const objectEntries = finalObjects
    .map((o) => `    ${JSON.stringify(o.name)}: ${JSON.stringify(o.id)}`)
    .join(",\n");

  // Build per-object OBJECT_VARIANTS: { objName: { layerName: { variantName: variantId } } }
  const objectVariantsEntries = finalObjects
    .map((obj) => {
      const objLayers = perObjectVariants.get(obj.name);
      if (!objLayers || objLayers.size === 0) {
        return `    ${JSON.stringify(obj.name)}: {}`;
      }
      const layerEntries = Array.from(objLayers.entries())
        .map(([layerName, variantNames]) => {
          const vlDef = finalVariantLayers.find((vl) => vl.name === layerName);
          if (!vlDef) return `      ${JSON.stringify(layerName)}: {}`;
          const varEntries = Array.from(variantNames)
            .map((vName) => {
              const v = vlDef.variants.find((v) => v.name === vName);
              return `        ${JSON.stringify(vName)}: ${JSON.stringify(v?.id ?? "")}`;
            })
            .join(",\n");
          return `      ${JSON.stringify(layerName)}: {\n${varEntries}\n      }`;
        })
        .join(",\n");
      return `    ${JSON.stringify(obj.name)}: {\n${layerEntries}\n    }`;
    })
    .join(",\n");

  // Build FRAMES map: { objectName: [frameNames] }
  const framesMapEntries = finalObjects
    .map((o) => {
      const frameNames = JSON.stringify(o.frames.map((f) => f.name));
      return `    ${JSON.stringify(o.name)}: ${frameNames}`;
    })
    .join(",\n");

  // Build VARIANT_FRAMES: { layerName: { variantName: frameCount } }
  const variantFramesEntries = finalVariantLayers
    .map((vl) => {
      const varEntries = vl.variants
        .map((v) => `    ${JSON.stringify(v.name)}: ${v.frames.length}`)
        .join(",\n");
      return `  ${JSON.stringify(vl.name)}: {\n${varEntries}\n  }`;
    })
    .join(",\n");

  return `/**
 * Generated export types and constants for project: ${projectName}
 * Exported as: ${kebabName}/
 * Do not edit by hand.
 *
 * Usage:
 *   import { parsePixelProject, loadTextures } from '../lib/parse-pixel-project';
 *   import { ${className} } from './${kebabName}';
 *
 *   const project = parsePixelProject(framesJson);
 *   const textures = await loadTextures(project, './${kebabName}');
 *   const instance = ${className}.createInstance(project, "Basic Unit Walk Front");
 *   instance.selectVariantByName("Hair", "Yellow Walk Down"); // type-checked per object
 */

import { createObjectInstance } from '../lib/parse-pixel-project';
import type { ObjectInstance, ParsedProject } from '../lib/parse-pixel-project';

// ─── Data ─────────────────────────────────────────────────────────────────

const OBJECTS = {
${objectEntries}
} as const;

/** Per-object variant layers and their available variants. */
const OBJECT_VARIANTS = {
${objectVariantsEntries}
} as const;

const FRAMES = {
${framesMapEntries}
} as const;

/** Frame counts for each variant, organized by variant layer. */
const VARIANT_FRAMES = {
${variantFramesEntries}
} as const;

// ─── Types ────────────────────────────────────────────────────────────────

export type ObjectName = keyof typeof OBJECTS;
export type ObjectVariantLayers<O extends ObjectName> = typeof OBJECT_VARIANTS[O];
export type VariantLayerName<O extends ObjectName> = keyof ObjectVariantLayers<O>;
export type VariantName<O extends ObjectName, L extends VariantLayerName<O>> =
  keyof ObjectVariantLayers<O>[L];

export type VariantLayerNameGlobal = keyof typeof VARIANT_FRAMES;
export type VariantNameGlobal<L extends VariantLayerNameGlobal> = keyof typeof VARIANT_FRAMES[L];

/** Typed instance for a specific object — carries variant and frame type info. */
export type TypedInstance<O extends ObjectName> =
  ObjectInstance<typeof OBJECT_VARIANTS[O], typeof FRAMES[O]>;

// ─── ${className} ─────────────────────────────────────────────────────

/** Static helper class for the "${projectName}" pixel project. */
export class ${className} {
  private constructor() {}

  static readonly PROJECT_NAME = ${JSON.stringify(projectName)} as const;
  static readonly PROJECT_VERSION = ${JSON.stringify(projectVersion)} as const;
  static readonly OBJECTS = OBJECTS;
  static readonly OBJECT_VARIANTS = OBJECT_VARIANTS;
  static readonly FRAMES = FRAMES;
  static readonly VARIANT_FRAMES = VARIANT_FRAMES;

  /** Get the object id for a given object name. */
  static getObjectId(name: ObjectName): string {
    return OBJECTS[name];
  }

  /** Get the frame count for a specific variant. */
  static getVariantFrameCount<L extends VariantLayerNameGlobal>(
    layerName: L,
    variantName: VariantNameGlobal<L> & string,
  ): number {
    const layer = VARIANT_FRAMES[layerName] as Record<string, number> | undefined;
    return layer?.[variantName] ?? 0;
  }

  /**
   * Create a typed object instance by object name.
   * The returned instance's selectVariantByName is type-safe for this object's
   * available variant layers and variants. frameNames is also typed.
   */
  static createInstance<O extends ObjectName>(
    project: ParsedProject,
    objectName: O,
  ): TypedInstance<O> {
    const objectId = OBJECTS[objectName];
    return createObjectInstance(project, objectId) as TypedInstance<O>;
  }
}
`;
}
