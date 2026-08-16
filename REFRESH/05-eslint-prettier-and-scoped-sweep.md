# 05 — ESLint flat config, Prettier, and the scoped format sweep

**Wave:** W3 · **Depends on:** 03, 04
**Touches:** `client/eslint.config.js` (new) · `server/eslint.config.js` (new) · `.prettierrc` (new, root) · `.prettierignore` (new, root) · `.git-blame-ignore-revs` (new, root) · `client/package.json` · `server/package.json` · `package.json` (root) · reformatted-only: `*.{json,md,yaml,yml}` at root, `client/*.{ts,js,json}`, `server/*.{ts,js,json}`, `client/src/types/**`, `client/src/services/api.ts`
**Effort:** M

## Objective

After this task `bunx eslint .` exits 0 in both workspaces, Prettier is installed with a config and an ignore file, and a **scoped** format sweep has landed as its own commit. The ESLint config already contains the architectural boundary rules that later waves depend on, keyed to the directory names this plan actually uses.

## Context

`client/package.json` declares `"lint": "eslint ."` but **no ESLint config file exists anywhere in the repo** — running it fails outright with `ESLint couldn't find an eslint.config.(js|mjs|cjs) file.` Five ESLint packages are installed and doing nothing. `server` has no lint script and no ESLint packages at all. Prettier is absent everywhere: not in any `package.json`, no `.prettierrc`.

### Versions to install (registry-verified; the set was dry-run-proven to resolve together)

```sh
cd client
bun add --exact -d eslint@9.39.5 @eslint/js@9.39.5 typescript-eslint@8.67.0
bun add --exact -d eslint-plugin-react-hooks@7.1.1 eslint-plugin-react-refresh@0.5.4
bun add --exact -d globals@17.11.0 eslint-config-prettier@10.1.8
cd ../server
bun add --exact -d eslint@9.39.5 @eslint/js@9.39.5 typescript-eslint@8.67.0
bun add --exact -d globals@17.11.0 eslint-config-prettier@10.1.8
cd ..
bun add --exact -d prettier@3.9.6          # ROOT — one Prettier for the whole repo
```

- **ESLint 9.39.5**, not 10. `typescript-eslint@8.67.0` does accept `^10`, but 9.39.5 is the settled `maintenance` target for `eslint-plugin-react-refresh` and the broader plugin ecosystem.
- `typescript-eslint@8.67.0` is the binding constraint on TypeScript (`>=4.8.4 <6.1.0`) — this is why task 03 pinned TS 5.9.3 rather than 6 or 7.
- `eslint-plugin-react-hooks@7.1.1` ships the React Compiler ruleset and enables more rules by default. **Expect a large first-run finding set across the 69 `.ts`/`.tsx` files in `client/src`.** That is normal; see Steps for how to handle it.

### The architectural boundary rules — get the globs right

Two later waves depend on ESLint rules that must be **keyed to `src/ui/**`**. This is settled: the component taxonomy owns that path name and the tooling plan's rule was written against the same glob. **Do not use `src/components/ui/` or `src/design-system/`.**

The three boundary config blocks to include (they will match nothing until the directories exist in wave W4 — that is expected and is why the enforceability probe in Verification matters):

```js
// ── The ui/ purity boundary ───────────────────────────────────────────────
{
  files: ["src/ui/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [{
        group: [
          "**/stores", "**/stores/**",
          "**/store",  "**/store/**",     // the legacy Zustand dir, during migration
          "**/api",    "**/api/**",
          "**/services/**",
          "mobx", "mobx-react-lite",
        ],
        message:
          "ui/ must stay pure: no store, API or MobX imports. Data comes in as props, " +
          "effects leave as callbacks. Wire it up in src/containers/ instead.",
      }],
      paths: [{
        name: "react",
        importNames: ["useContext"],
        message:
          "ui/ may not read context — a context read is a hidden dependency that a " +
          "story cannot supply. Pass the value as a prop.",
      }],
    }],
  },
},

// ── Primitives are additionally forbidden domain types ────────────────────
{
  files: ["src/ui/primitives/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [
        { group: ["**/stores/**", "**/store/**", "**/api/**", "**/services/**"],
          message: "Primitives are store-free (see ui/ rule)." },
        { group: ["**/types", "**/types/**"],
          message:
            "A primitive may not know a domain type. If it needs Project/Layer/Frame/" +
            "Variant/Palette it belongs in ui/components/ instead." },
      ],
    }],
  },
},

// ── Containers are the only tier allowed to call observer() ───────────────
{
  files: ["src/**/*.{ts,tsx}"],
  ignores: ["src/containers/**"],
  rules: {
    "no-restricted-imports": ["error", {
      paths: [{
        name: "mobx-react-lite",
        message: "observer() belongs in src/containers/ only.",
      }],
    }],
  },
},

// ── Domain stores may not import UI stores (the hot-path rule) ────────────
{
  files: ["src/stores/domain/**/*.ts"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [{
        group: ["**/stores/ui/**", "**/stores/ui"],
        message:
          "DomainStore and its sub-stores must not read UIStore. Selection mask, " +
          "selectionBehavior and variantFrameIndices are passed as ARGUMENTS.",
      }],
    }],
  },
},
```

Use `no-restricted-imports` (core rule), **not** `import/no-restricted-paths` — `eslint-plugin-import` is not in the dependency set and adding it drags in a resolver plus a peer negotiation with `typescript-eslint@8.67`.

`eslint-config-prettier` must be **last** in the flat-config array so it can turn off the stylistic rules that fight Prettier.

### Why the format sweep is split in two

A single repo-wide `prettier --write` is wrong in both possible positions. This task runs **Sweep A (scoped)**; a later task runs **Sweep B (the remainder)**, after the big component splits have already rewritten those files. Reasons, both measured:

- Sweeping `client/src/components/**` now would reformat ~1,400 lines that later tasks delete outright as duplication.
- It would also destroy the `diff <(sed -n '212,232p' Canvas.tsx) <(sed -n '132,152p' LightingCanvas.tsx)`-style evidence that later tasks rely on to prove two blocks are byte-identical before unifying them.

**Sweep A scope, exactly:** root `*.{json,md,yaml,yml}`, `client/*.{ts,js,json}` (config files at the workspace root only), `server/*.{ts,js,json}`, `client/src/types/**`, and `client/src/services/api.ts`. Nothing else.

`.prettierignore` must exclude: `**/node_modules`, `**/dist`, `**/coverage`, `**/storybook-static`, `client/lib/**` (public API copied verbatim into exports), `server/src/data/**` (the owner's real project files and backups), `server/exports/**`, and `**/__fixtures__/**`. (No lockfile entry is needed: this project has **no lockfiles by policy** — owner decision, 2026-08-16 — `bunfig.toml`'s `[install.lockfile] save = false` stays and every dependency is pinned to an exact version in `package.json` instead. Task 01 deleted the one stray `server/bun.lock` and gitignored the filenames.)

## Steps

1. Install the packages listed in Context.
2. Write `client/eslint.config.js` as a flat config using `tseslint.config(...)`. It must cover: `@eslint/js` recommended, `typescript-eslint` recommended (with `projectService` for type-aware rules), `eslint-plugin-react-hooks` `recommended-latest`, `eslint-plugin-react-refresh` `vite` preset, `globals.browser`, and the **four boundary blocks quoted verbatim in Context**. Ignore `dist`, `node_modules`, `coverage`, `storybook-static`, and `client/lib`. Put `eslint-config-prettier` last.
3. Write `server/eslint.config.js`: same base, Node globals (`globals.node`), **no React plugins**. Ignore `dist`, `node_modules`, `src/data`.
4. Run `bunx eslint .` in `client` and **read the entire first report before changing any severity.** `eslint-plugin-react-hooks@7` will produce a large finding set. Triage rule: fix anything that is a genuine hook-dependency bug; downgrade to `warn` anything that would require restructuring a component (those components are being restructured by later tasks anyway). Do **not** mass-`--fix` and do **not** blanket-disable a rule file-wide. Record the severity decisions in the commit message.
5. Add scripts: `client` and `server` each get `"lint": "eslint ."` and `"lint:fix": "eslint . --fix"`. Root gets `"lint"`, `"lint:fix"`, `"format": "bunx prettier --write ."`, `"format:check": "bunx prettier --check ."`.
6. Write `.prettierrc` and `.prettierignore` at the repo root, with the ignore entries listed in Context.
7. **Sweep A, as its own commit containing nothing else:**
   ```sh
   cd /Users/diniden/Desktop/self/pixel-art
   bunx prettier --write "*.{json,md,yaml,yml}" "client/*.{ts,js,json}" "server/*.{ts,js,json}" "client/src/types/**" "client/src/services/api.ts"
   ```
   Then immediately confirm behaviour-neutrality: `cd client && bunx tsc --noEmit` must still exit 0.
8. Create `.git-blame-ignore-revs` at the root and append the Sweep A commit SHA to it.

## Constraints

- **No lockfiles; pin exact versions.** Standing project policy (owner decision, 2026-08-16): `bunfig.toml`'s `[install.lockfile] save = false` is deliberate and must stay, the repo has no lockfile of any kind, and every dependency is written as an exact version in `package.json`. Every `bun add` in this task uses `--exact` (plain `bun add x@1.2.3` writes `"^1.2.3"`). Never create, commit or regenerate a lockfile; `--frozen-lockfile` is meaningless here.
- **The Sweep A commit must contain only formatting.** If it contains a config change or a lint fix, the ESLint findings become unreviewable.
- **Do not run `prettier --write` on `client/src/components/**`, `client/src/store/**`, or any `.css` file.** Those are Sweep B's, deliberately late.
- Do not touch `client/lib/**` or `server/src/data/**` — the first is public API copied into exports, the second is the owner's real project data and backups.
- The `ui/` glob is **`src/ui/**`**. Do not rename it.
- Do not add `eslint-plugin-import`.
- Do not add CI in this task.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client && bunx eslint .          # exit 0
cd /Users/diniden/Desktop/self/pixel-art/server && bunx eslint .          # exit 0
cd /Users/diniden/Desktop/self/pixel-art && bun run format:check          # exit 0 on swept paths
cd client && bunx tsc --noEmit                                            # still exit 0
```

**Boundary enforceability probe — a rule that matches nothing looks exactly like a rule that passes, so this is mandatory:**

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
mkdir -p src/ui/components
printf 'import { useEditorStore } from "../../store";\nexport const x = useEditorStore;\n' > src/ui/components/__probe.ts
bunx eslint src/ui/components/__probe.ts && { echo "BOUNDARY NOT ENFORCED"; rm -rf src/ui; exit 1; }
mkdir -p src/ui/primitives
printf 'import type { Layer } from "../../types";\nexport type X = Layer;\n' > src/ui/primitives/__probe.ts
bunx eslint src/ui/primitives/__probe.ts && { echo "PRIMITIVE TYPE BAN NOT ENFORCED"; rm -rf src/ui; exit 1; }
rm -rf src/ui/components/__probe.ts src/ui/primitives/__probe.ts
echo "boundaries enforced"
```

Manual checks:
- Read the ESLint error message text for the `ui/` rule — it must explain *why*, so a future agent knows what to do instead.
- `git diff --stat` on the Sweep A commit must touch only the paths listed in Context. Spot-check three files' diffs for accidental semantic change (a `trailingComma` inside a call, a reflowed template literal).

## Definition of done

- [ ] `client/eslint.config.js` and `server/eslint.config.js` exist; `bunx eslint .` exits 0 in both.
- [ ] The four boundary config blocks are present, keyed to `src/ui/**`, `src/ui/primitives/**`, `src/containers/**` and `src/stores/domain/**`.
- [ ] Both boundary probes **fail** ESLint (proving the rules are live), and the probe files are deleted afterwards.
- [ ] `eslint-config-prettier` is last in the flat-config array.
- [ ] `.prettierrc` and `.prettierignore` exist at the root, with `client/lib/**`, `server/src/data/**` and `**/__fixtures__/**` excluded.
- [ ] Sweep A landed as its own commit, touching only the scoped paths, with `bunx tsc --noEmit` unchanged at 0 errors.
- [ ] `.git-blame-ignore-revs` exists and contains the Sweep A SHA.
- [ ] The `eslint-plugin-react-hooks@7` first-run report was read and its severity decisions recorded in the commit message.
