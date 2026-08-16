import { fileURLToPath } from "node:url";

/**
 * The single source of truth for the client's path aliases.
 *
 * Imported by BOTH `vite.config.ts` and `vitest.config.ts` so the two can never
 * drift. The third copy — `compilerOptions.paths` in `tsconfig.json` — has to be
 * hand-mirrored because tsconfig is JSON; the proof that all three agree is that
 * `src/utils/__tests__/alphaBlend.test.ts` imports via `@/` and passes under both
 * `bunx tsc --noEmit` and `bunx vitest run`.
 *
 * ⚠️ Keys here must stay character-for-character identical to the tsconfig
 * `paths` keys (modulo tsconfig's required trailing `/*`).
 */
const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export const aliases: Record<string, string> = {
  "@ui": `${srcDir}/ui`,
  "@stores": `${srcDir}/stores`,
  "@api": `${srcDir}/api`,
  "@test": `${srcDir}/test`,
  // `@` is last: Vite/Vitest resolve string aliases by longest-prefix-wins in
  // object order, and a bare `@` listed first would swallow `@ui/...` etc.
  "@": srcDir,
};
