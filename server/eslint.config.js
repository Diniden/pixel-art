import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      "src/data",
      // Gitignored and untracked: the owner's generated export artefacts.
      // `exports/lib/` is additionally consumed verbatim by external game code
      // (CLAUDE.md / OPEN-QUESTIONS.md Q33) and must not be reformatted or
      // lint-driven. It is also outside `tsconfig.json`'s `include`, so the
      // type-aware parser cannot resolve it at all.
      "exports",
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    files: ["**/*.{ts,js}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      parserOptions: {
        projectService: {
          // `tsconfig.json` includes only `src/**/*`, so this very config file
          // is outside the project service and would be a hard parse error.
          allowDefaultProject: ["*.js", "*.ts"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // NOTE (REFRESH task 11): this block used to demote
  // `@typescript-eslint/no-unused-vars` to `warn` for `src/routes/**` to keep
  // W3's one genuine finding — an unused `ensureDir` import in
  // `src/routes/project.ts` — visible without widening task 05's scope. Task 11
  // owns `server/src/**`, removed that import, and has therefore removed the
  // demotion: unused vars are a hard ERROR again everywhere on the server.

  prettier,
);
