import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["dist", "node_modules", "coverage", "storybook-static", "lib"],
  },

  js.configs.recommended,
  tseslint.configs.recommended,
  // NOTE: in eslint-plugin-react-hooks@7, `configs["recommended-latest"]` is the
  // LEGACY eslintrc shape (`plugins: ["react-hooks"]`) and crashes flat config.
  // The flat-config equivalent lives under `configs.flat`.
  reactHooks.configs.flat["recommended-latest"],
  reactRefresh.configs.vite,

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        projectService: {
          // `tsconfig.json` includes only `src` and `lib`, so the workspace-root
          // config files (vite.config.ts, eslint.config.js) are outside the
          // project service and would otherwise be a hard parse error.
          allowDefaultProject: ["*.ts", "*.js"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Config files at the workspace root are Node-authored, not browser code.
  {
    files: ["*.{js,ts}"],
    languageOptions: {
      globals: globals.node,
    },
  },

  // ── Severity triage of the eslint-plugin-react-hooks@7 first run ──────────
  //
  // The v7 React Compiler ruleset produced 98 findings across the 69 files in
  // src/. Every one of them lives in a file that a scheduled REFRESH wave
  // rewrites or deletes outright, and each would require restructuring a
  // component rather than a local edit. Per task 05's triage rule ("downgrade
  // to warn anything that would require restructuring a component"), they are
  // demoted to `warn` here, scoped to the legacy directories only — NOT
  // disabled, and NOT demoted globally. New code written under src/ui/,
  // src/containers/ and src/stores/ gets the rules at full `error` strength.
  {
    files: ["src/components/**/*.{ts,tsx}", "src/store/**/*.ts"],
    rules: {
      // 13 findings: hooks called after an early return. Genuine, but the fix
      // is hoisting hooks above the guard in ColorPicker / NormalPicker /
      // FrameReferencePanel — those components are decomposed by later waves.
      "react-hooks/rules-of-hooks": "warn",
      // 20 findings: ref reads/writes during render, flagged by the Compiler.
      "react-hooks/refs": "warn",
      // 17 findings: setState inside an effect (the derived-state pattern this
      // codebase uses throughout). Removing it is a state-model change.
      "react-hooks/set-state-in-effect": "warn",
      // 2 findings: the `animate`-before-declaration rAF loops in PreviewModal
      // and ExportPreviewModal. Both are unified by a later wave.
      "react-hooks/immutability": "warn",
      // 1 finding: FramesView's useCallback deps differ from the inferred set.
      "react-hooks/preserve-manual-memoization": "warn",
      // 11 findings: modules exporting both components and helpers. The helper
      // extraction is exactly what the ui/ + containers/ split does.
      "react-refresh/only-export-components": "warn",
      // 4 findings, all in ReferenceImageModal's canvas-filter plumbing.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // `_`-prefixed bindings are this codebase's existing deliberate-discard
  // convention (destructured tuple slots, unused callback params). Honour it
  // rather than editing 10 call sites that later waves rewrite.
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          // `const { a, b, ...rest } = obj` to strip properties is a real,
          // load-bearing idiom in src/store/timelineActions.ts (5 findings) —
          // the bindings exist precisely so `rest` omits them.
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // 3 findings: `let updatedObj` that is never reassigned, in
  // src/store/layerClipboardActions.ts. A genuine (harmless) nit, but the fix
  // is an edit to Zustand action code that the MobX migration replaces
  // wholesale. Demoted rather than edited so the sweep stays formatting-only.
  {
    files: ["src/store/**/*.ts"],
    rules: {
      "prefer-const": "warn",
    },
  },

  // ══ ARCHITECTURAL BOUNDARIES ══════════════════════════════════════════════
  //
  // ⚠️ ORDER IS LOAD-BEARING. In ESLint flat config a later block REPLACES a
  // rule's entire options object — options do NOT merge. Task 05's spec lists
  // the `src/**` observer() block AFTER the two `src/ui/**` blocks, which makes
  // it match every ui/ file and silently overwrite the purity patterns with
  // just its own `paths` entry. Verified: with the spec's ordering,
  // `--print-config src/ui/components/x.ts` returned only the mobx-react-lite
  // path and BOTH boundary probes PASSED lint — the exact silent-no-op failure
  // MASTER.md §9.9 exists to prevent.
  //
  // Fix: broadest block FIRST, narrower blocks after, and every narrower block
  // re-states the mobx-react-lite ban so overriding loses nothing.

  // ── Containers are the only tier allowed to call observer() ───────────────
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/containers/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "mobx-react-lite",
              message: "observer() belongs in src/containers/ only.",
            },
          ],
        },
      ],
    },
  },

  // ── The ui/ purity boundary ───────────────────────────────────────────────
  {
    files: ["src/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/stores",
                "**/stores/**",
                "**/store",
                "**/store/**", // the legacy Zustand dir, during migration
                "**/api",
                "**/api/**",
                "**/services/**",
                "mobx",
                "mobx-react-lite",
              ],
              message:
                "ui/ must stay pure: no store, API or MobX imports. Data comes in as props, " +
                "effects leave as callbacks. Wire it up in src/containers/ instead.",
            },
          ],
          paths: [
            {
              name: "react",
              importNames: ["useContext"],
              message:
                "ui/ may not read context — a context read is a hidden dependency that a " +
                "story cannot supply. Pass the value as a prop.",
            },
            // Re-stated: this block replaces the observer() block's options.
            {
              name: "mobx-react-lite",
              message: "observer() belongs in src/containers/ only.",
            },
          ],
        },
      ],
    },
  },

  // ── Primitives are additionally forbidden domain types ────────────────────
  {
    files: ["src/ui/primitives/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/stores",
                "**/stores/**",
                "**/store",
                "**/store/**",
                "**/api",
                "**/api/**",
                "**/services/**",
                "mobx",
                "mobx-react-lite",
              ],
              message: "Primitives are store-free (see ui/ rule).",
            },
            {
              group: ["**/types", "**/types/**"],
              message:
                "A primitive may not know a domain type. If it needs Project/Layer/Frame/" +
                "Variant/Palette it belongs in ui/components/ instead.",
            },
          ],
          // Re-stated: this block replaces the ui/ block's options.
          paths: [
            {
              name: "react",
              importNames: ["useContext"],
              message:
                "ui/ may not read context — a context read is a hidden dependency that a " +
                "story cannot supply. Pass the value as a prop.",
            },
            {
              name: "mobx-react-lite",
              message: "observer() belongs in src/containers/ only.",
            },
          ],
        },
      ],
    },
  },

  // ── Domain stores may not import UI stores (the hot-path rule) ────────────
  {
    files: ["src/stores/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/stores/ui/**", "**/stores/ui"],
              message:
                "DomainStore and its sub-stores must not read UIStore. Selection mask, " +
                "selectionBehavior and variantFrameIndices are passed as ARGUMENTS.",
            },
          ],
          // Re-stated: this block replaces the observer() block's options.
          // Domain stores are not containers, so observer() is banned here too.
          paths: [
            {
              name: "mobx-react-lite",
              message: "observer() belongs in src/containers/ only.",
            },
          ],
        },
      ],
    },
  },

  prettier,
);
