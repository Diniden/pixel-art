// Barrel for the types layer. All 57 public symbols that the original
// single-file module exported are re-exported here so every existing
// `import ... from "../types"` / `"@/types"` keeps working unchanged.
//
// codecs/migrate.ts additionally exports migrateLayerVariantOffset (it was a
// module-private helper before the split and codecs/deserialize.ts needs it);
// it is deliberately NOT re-exported here, keeping the public surface exact.
export * from "./domain";
export * from "./constants";
export * from "./factories";
export * from "./codecs/pixel";
export * from "./codecs/compactTypes";
export * from "./codecs/serialize";
export * from "./codecs/deserialize";
export {
  isCompactFormat,
  isLegacyCompactFormat,
  migrateLegacyLayer,
  migrateLegacyPixel,
} from "./codecs/migrate";
