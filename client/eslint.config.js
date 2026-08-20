import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";
import storybook from "eslint-plugin-storybook";

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
          //
          // ⚠️ `.storybook/**` (task 10) is listed HERE rather than in its own
          // later block. `parserOptions` REPLACES, exactly like rule options do
          // (see the ARCHITECTURAL BOUNDARIES note below): a separate
          // `.storybook/**` block carrying its own `projectService` dropped
          // `["*.ts", "*.js"]` and turned aliases.ts, vite.config.ts and
          // vitest.config.ts into 3 hard parse errors. Measured, not guessed.
          // NOTE (task 19): `.storybook/decorators/*.tsx` was removed from
          // this list. Since Modal.stories.tsx (src/, inside the tsconfig
          // project) imports the modalHost decorator, the project service now
          // discovers that file by following imports, and a file may not be
          // BOTH project-service-owned and allowDefaultProject-listed (hard
          // parse error, measured). main.ts/preview.tsx are still only
          // reachable from outside the project and stay listed.
          allowDefaultProject: ["*.ts", "*.js", ".storybook/*.ts", ".storybook/*.tsx"],
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
  //
  // ── W27 / task 36 AMENDMENT: the triage must follow the files ─────────────
  //
  // Task 36 physically relocates `src/components/*` into `src/ui/components/*`
  // WITHOUT restructuring them — its spec is explicit: "Do not restructure any
  // component beyond the extractions named in step 3 — the big splits were
  // task 35."
  //
  // Measured during W27: moving the first seven components turned 18 of these
  // already-triaged WARNINGS into hard ERRORS, on files whose content differs
  // from HEAD only in import-path depth (`diff` confirmed: import lines only).
  // The findings are the same pre-existing debt in a new directory — the move
  // changed their severity, not the code.
  //
  // There were only two honest options, since the debt is real either way:
  //   (a) restructure the components to satisfy the rules — forbidden by this
  //       task's own spec, and exactly the "restructuring a component" that
  //       task 05's triage rule says to demote rather than force; or
  //   (b) let the triage follow the files it was written for.
  //
  // (b) is taken here. The paths below enumerate the RELOCATED components
  // individually rather than demoting `src/ui/**` wholesale — a blanket
  // demotion would silently weaken the rules for genuinely new `ui/` code,
  // which is the one thing the original comment says not to do. New components
  // written under `src/ui/` still get these rules at full `error` strength.
  //
  // ⚠️ This list is DEBT, not policy. Each entry should be deleted as its
  // component is actually restructured; none should ever be added to for new
  // code.
  {
    files: [
      "src/components/**/*.{ts,tsx}",
      "src/store/**/*.ts",
      // Relocated by task 36 (W27), content otherwise unchanged:
      "src/ui/components/AnchorGrid/**/*.{ts,tsx}",
      "src/ui/components/ResizeModal/**/*.{ts,tsx}",
      "src/ui/components/EdgeInterpolateModal/**/*.{ts,tsx}",
      "src/ui/components/PreviewModal/**/*.{ts,tsx}",
      "src/ui/components/ObjectSelectModal/**/*.{ts,tsx}",
      "src/ui/components/ExportPreviewModal/**/*.{ts,tsx}",
      "src/ui/components/BrowseBackupsModal/**/*.{ts,tsx}",
      "src/ui/components/ColorPicker/**/*.{ts,tsx}",
      "src/ui/components/FrameTagsModal/**/*.{ts,tsx}",
      "src/ui/components/Header/**/*.{ts,tsx}",
      "src/ui/components/FrameReferencePanel/**/*.{ts,tsx}",
      "src/ui/components/FrameTimeline/**/*.{ts,tsx}",
      "src/ui/components/ReferenceImageModal/**/*.{ts,tsx}",
    ],
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

  // ══ R2: NEVER DEEP-OBSERVE A PIXEL GRID ═══════════════════════════════════
  //
  // The single largest performance risk in this refresh (MASTER.md R2). The
  // owner's real project holds 300,249 `PixelData` cells, each
  // `{color: Pixel|0, normal: Normal|0, height: number}`. `makeAutoObservable`
  // is DEEP, so calling it on a pixel type builds ~1M proxies — and it
  // presents as "MobX is slow" rather than as the modelling error it is.
  //
  // `layer.pixels` is `observableRef`, ALWAYS. This rule makes the most
  // likely way to break that a lint error instead of a mystery.
  //
  // NOTE this is its own block with its own rule, so it cannot collide with
  // the `no-restricted-imports` options juggling below — different rule, no
  // replace-not-merge hazard between them. `no-restricted-syntax` is not set
  // anywhere else in this file (verified), so nothing here overrides.
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          // The realistic shape of the mistake: a class NAMED for a pixel
          // type calling makeAutoObservable(this) in its constructor.
          //
          // ⚠️ Selector verified by probe, not assumed. An earlier attempt
          // matched `CallExpression[callee.name=...] > Identifier[name=...]`,
          // which tests the ARGUMENT VARIABLE's name (`cell`), not its type —
          // so it silently matched nothing. A rule that matches nothing looks
          // exactly like a rule that passes; both selectors here were
          // confirmed to FAIL lint on a probe file before landing.
          selector:
            "ClassDeclaration[id.name=/Pixel(Data)?$|Normal$/] CallExpression[callee.name=/^makeAutoObservable$|^makeObservable$/]",
          message:
            "R2: never makeAutoObservable a PixelData/Pixel/Normal. The real project has " +
            "300,249 cells; deep observation creates ~1M proxies and presents as 'MobX is " +
            "slow'. Pixel grids are `observableRef` and are replaced wholesale; anything " +
            "deriving from pixel CONTENT must read `domain.pixelVersion` instead.",
        },
        {
          // A variable/param whose own name says it holds pixel data.
          selector:
            "CallExpression[callee.name=/^makeAutoObservable$|^makeObservable$/] > Identifier[name=/^(pixel|pixelData|pixels|normal|normals)$/i]",
          message:
            "R2: never make pixel data observable — see the rule above. Grids are " +
            "`observableRef` and are replaced wholesale.",
        },
        {
          // The same mistake spelled as a type argument:
          // makeAutoObservable<PixelData>(...) / makeObservable<Pixel>(...)
          selector:
            "CallExpression[callee.name=/^makeAutoObservable$|^makeObservable$/] > TSTypeParameterInstantiation > TSTypeReference > Identifier[name=/Pixel(Data)?$|Normal$/]",
          message:
            "R2: never make a PixelData/Pixel/Normal observable — see the rule above.",
        },
      ],
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
              // Task 19 closed a measured gap: the original two patterns
              // matched neither the relative form (`../ui/...` from
              // src/stores/domain/) nor the alias form (`@stores/ui/...` —
              // "@stores" is not the segment "stores"). All four forms are
              // banned; the boundary probe covers the added ones.
              group: [
                "**/stores/ui/**",
                "**/stores/ui",
                "../ui",
                "../ui/**",
                "@stores/ui",
                "@stores/ui/**",
              ],
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

  // ── The API layer imports no app state and no UI (task 15) ────────────────
  //
  // `src/api/` is pure transport: it may import types, but never a store
  // (either the legacy Zustand `store/` or the MobX `stores/`) and never a
  // component. Same flat-config hazard as above: this narrower block REPLACES
  // the broadest block's options for api files, so the mobx-react-lite ban is
  // re-stated.
  {
    files: ["src/api/**/*.{ts,tsx}"],
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
                "**/components/**",
              ],
              message:
                "The API layer is pure transport: no store, no components. " +
                "Callers pass data in; typed results and ApiErrors come out.",
            },
          ],
          paths: [
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

  // ── Storybook (task 10) ───────────────────────────────────────────────────
  //
  // ⚠️ A SEPARATE BLOCK, deliberately placed AFTER the boundary blocks and
  // NOT merged into them. Same reason the boundary blocks are ordered the way
  // they are: in flat config a later block REPLACES a rule's entire options
  // object. Editing a boundary block to bolt story globs on would silently drop
  // whichever `paths`/`patterns` set it did not restate.
  //
  // Placing this AFTER them is safe because `storybook.configs["flat/recommended"]`
  // sets NO `no-restricted-imports` at all — verified against the installed
  // 9.1.20: its three blocks set only the `storybook/*` rules plus
  // `react-hooks/rules-of-hooks` and `import/no-anonymous-default-export`.
  // It therefore cannot clobber the ui/ purity or observer() options.
  //
  // The boundary probe was re-run after adding this block and BOTH probes
  // still FAIL lint, which is the required outcome.
  //
  // Note the story glob is `**/*.stories.@(ts|tsx|...)`, so `Button.stories.tsx`
  // living under `src/ui/primitives/` is ALSO still matched by the primitives
  // boundary block above — a story may not import a store or a domain type
  // either, which is exactly right: a story that needs a store is evidence the
  // component is not pure.
  ...storybook.configs["flat/recommended"],

  {
    // `import/no-anonymous-default-export` comes from the `import` plugin, which
    // is NOT installed here (task 05 chose typescript-eslint + react-hooks +
    // react-refresh only). ESLint errors on a configured-but-undefined rule, so
    // switch it off rather than adding a plugin this repo does not otherwise use.
    files: [
      "**/*.stories.@(ts|tsx|js|jsx|mjs|cjs)",
      "**/*.story.@(ts|tsx|js|jsx|mjs|cjs)",
    ],
    rules: {
      "import/no-anonymous-default-export": "off",
      // A story file's default export is CSF `meta`, not a component, and its
      // named exports are stories, not components. react-refresh's rule is
      // structurally inapplicable to CSF.
      "react-refresh/only-export-components": "off",
    },
  },

  // `.storybook/` is Storybook's own build/preview configuration, not app code
  // that Vite ever hot-reloads. `react-refresh/only-export-components` is
  // structurally inapplicable there: `decorators/modalHost.tsx` exports a
  // decorator plus the `modalHostStyle` object it shares, and `preview.tsx`
  // default-exports a config object.
  //
  // NOTE the parser settings for these files are NOT here — they live in the
  // `allowDefaultProject` list of the main `**/*.{ts,tsx}` block above, because
  // `parserOptions` replaces rather than merges. Only rules are set here.
  {
    files: [".storybook/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },

  prettier,
);
