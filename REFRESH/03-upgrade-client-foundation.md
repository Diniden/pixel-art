# 03 — Client foundation upgrade: React 19 · Vite 7 · TypeScript 5.9

**Wave:** W2a · **Depends on:** 01, 02
**Touches:** `client/package.json` · `client/vite.config.ts` · `client/tsconfig.json` · `server/package.json` (**the `devDependencies.typescript` key only** — see Constraints)
**Effort:** M

## Objective

After this task the client runs React 19.2.8, Vite 7.3.6 with `@vitejs/plugin-react` 5.2.0, and TypeScript 5.9.3, with `bunx tsc --noEmit` and `bun run build` both still exiting 0. This must happen **before** the test and Storybook harnesses are installed, so that harness is authored once against its final React and Vite and never needs re-validation.

## Context

Every version below is registry-verified and the whole set was **proven to resolve together** with `bun install --dry-run` (exit 0, no peer warnings) — see REFRESH-PREP/findings/dependencies.md § New tooling compatibility matrix. Do not substitute versions.

| Package | From (installed) | To | Why this exact version |
| --- | --- | --- | --- |
| `react` | 18.3.1 | **19.2.8** | Target React |
| `react-dom` | 18.3.1 | **19.2.8** | Lockstep with `react` |
| `@types/react` | 18.3.28 | **19.2.18** | Lockstep |
| `@types/react-dom` | 18.3.7 | **19.2.4** | Lockstep |
| `vite` | 5.4.21 | **7.3.6** | **Not 8.2.1.** Vite 8 is the rolldown rewrite. Vitest 3.2.7's peer is `vite ^5 \|\| ^6 \|\| ^7.0.0-0`; Storybook 9's `@storybook/react-vite` peers `vite ^5 \|\| ^6 \|\| ^7`. Engines: `node ^20.19.0 \|\| >=22.12.0`. |
| `@vitejs/plugin-react` | 4.7.0 | **5.2.0** | **Not 6.0.5** — its registry-verified peer is `{"vite": "^8.0.0"}` **only**, which would force the whole Vite 8 stack. 5.2.0 peers `vite ^4.2 \|\| ^5 \|\| ^6 \|\| ^7`. |
| `typescript` | 5.6.3 | **5.9.3** | **Not TS 6 or 7.** `typescript-eslint@8.67.0`'s peer is `typescript: ">=4.8.4 <6.1.0"`; TS 6 and 7 are both outside the supported window. 5.9.3 is the top of the 5.x line. |

**Do NOT upgrade `zustand`** (declared `^4.5.2` before task 01, pinned to exactly `4.5.2` by task 01; installed 4.5.7 under the old range). The locked decision is Zustand → MobX; upgrading to 5.0.15 then deleting it is wasted work. Its sole importer is `client/src/store/index.ts:1`.

**Do NOT upgrade `lucide-react`** in this task. Its peer range is React-19-safe at both 0.575.0 and 1.31.0 (`react: ^16.5.1 || ^17 || ^18 || ^19`), but 0.x → 1.x can rename or remove icon exports. It is deferred to a later task so any missing export surfaces as an unambiguous compile error against an otherwise-green tree.

### What React 19 breaks here: nothing found

Every React 19 removal was grepped across `client/src` and returned **zero** matches:

```
grep -rn "defaultProps" .                                  → NONE
grep -rn "propTypes" .                                     → NONE
grep -rn 'ref="' .                                         → NONE   (string refs)
grep -rn "contextTypes\|getChildContext" .                 → NONE   (legacy context)
grep -rn "createFactory" .                                 → NONE
grep -rn "ReactDOM.render\|ReactDOM.hydrate\|unmountComponentAtNode\|findDOMNode" . → NONE
grep -rn "react-test-renderer" .                           → NONE
grep -rnE "useRef<[^>]*>\(\)" .                            → NONE   (React 19 requires an argument)
grep -rn "useRef()" .                                      → NONE
grep -rn "JSX.Element\|JSX.IntrinsicElements" .            → NONE
grep -rn "forwardRef" .                                    → NONE
```

- `client/src/main.tsx:2,6` already uses `createRoot(...).render(<StrictMode>…)` — the React 18 API React 19 keeps.
- `createPortal` is used at `client/src/components/ObjectLibrary/ObjectLibrary.tsx:2,152,605` — unchanged in React 19.
- No `forwardRef` anywhere, so React 19 making `ref` a regular prop is a pure no-op here.
- No global `JSX.*` namespace usage, so the most common `@types/react@19` compile break does not apply.

**The one real caveat, and it is a runtime risk not a compile risk:** React 19 tightens StrictMode double-invocation and ref-cleanup semantics. `client/src/main.tsx:7` wraps the app in `<StrictMode>`, and there are **111 `useRef` sites across 23 files**, concentrated in `client/src/components/Canvas/Canvas.tsx` and `client/src/components/Canvas/LightingCanvas.tsx`. Imperative canvas effects with manual listener attachment are exactly where StrictMode changes bite. This is **not detectable by grep or by the typechecker** — it needs the manual canvas smoke test in Verification below.

### What Vite 7 breaks here: almost nothing

`client/vite.config.ts` uses only `defineConfig`, `loadEnv`, `plugins`, `envDir`, and `server.proxy` — all stable across 5→6→7. The forcing function is peers, not features: Vitest 3.2.7 excludes Vite 5. The dev-server proxy at `client/vite.config.ts:16-25` maps `/api` and serves `/exports`; that is the piece most likely to regress and it has an explicit check below.

## Steps

> **Exact pinning is mandatory — OWNER DECISION (2026-08-16).** This project uses **no lockfiles** (`bunfig.toml`'s `[install.lockfile] save = false` is deliberate and stays). Reproducibility comes entirely from exact versions in `package.json`. **Every `bun add` below must use `--exact`**, because plain `bun add react@19.2.8` writes `"^19.2.8"`, which would reintroduce a range. Task 01 removed all 22 flexible specifiers; this task must not add one back. Do not create, commit, or regenerate any lockfile.

1. Upgrade React and its types in one commit:
   ```sh
   cd /Users/diniden/Desktop/self/pixel-art/client
   bun add --exact react@19.2.8 react-dom@19.2.8
   bun add --exact -d @types/react@19.2.18 @types/react-dom@19.2.4
   bunx tsc --noEmit                                  # must exit 0
   ```
   If new type errors appear, they will be in the 23 `useRef` files; fix them in this task.
2. Upgrade Vite and the React plugin in one commit (they must move together):
   ```sh
   bun add --exact -d vite@7.3.6 @vitejs/plugin-react@5.2.0
   bunx vite build                                     # must exit 0
   ```
3. Read `client/vite.config.ts` and confirm the `server.proxy` block and `envDir` are intact and unchanged. No edit should be needed; if Vite 7 warns about any option, fix it here.
4. Upgrade TypeScript in both workspaces so the repo never has two TS versions:
   ```sh
   cd /Users/diniden/Desktop/self/pixel-art/client && bun add --exact -d typescript@5.9.3 && bunx tsc --noEmit
   cd /Users/diniden/Desktop/self/pixel-art/server && bun add --exact -d typescript@5.9.3 && bunx tsc --noEmit
   ```
   Both must exit 0. TypeScript 5.9 may surface new errors in the previously-clean `server` workspace — fix them here.
5. Confirm no range operator and no lockfile was introduced:
   ```sh
   cd /Users/diniden/Desktop/self/pixel-art
   ! grep -qE '"[^"]+": *"[~^><*]' client/package.json server/package.json
   test -z "$(find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules)"
   ```
   If a range appears, rewrite the specifier by hand to the exact version. If a lockfile appears, `bunfig.toml` was modified — restore it and delete the lockfile.

## Constraints

- **Do not install `zustand@5`, `@vitejs/plugin-react@6`, `vite@8`, `typescript@6`, or `typescript@7`.** Each is explicitly excluded above with a measured reason.
- **Do not create, commit, or regenerate a lockfile, and do not edit `bunfig.toml`.** No-lockfiles + exact pinning is a standing project policy (owner decision, 2026-08-16). Every `bun add` uses `--exact`.
- Do not install Vitest, Storybook, ESLint, Prettier, or MobX here. Those are tasks 04, 05, 08 and 12.
- Do not refactor any component. If a React 19 type change forces an edit, make the minimal edit and note it.
- Do not touch `server/src/` beyond whatever TypeScript 5.9 forces.
- ⚠️ **In `server/package.json` you may write exactly ONE key: `devDependencies.typescript`.** You upgrade TypeScript in both workspaces so the repo never carries two TS versions. Task 04 (wave W2b) later edits `express`, `@types/express`, `sharp` and `tsx` in that same file — **it runs after you, not alongside you**, so there is no concurrent write to coordinate. Leave every other key exactly as you found it.
- `npm` and `node` are not on PATH. Use `bun` / `bunx` only.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx vite build && test -d dist
cd ../server && bunx tsc --noEmit
# Confirm the intended versions actually resolved:
cd ../client
grep -q '"react": "19' package.json && grep -q '"vite": "7' package.json && grep -q '"typescript": "5.9' package.json
# No range operators, no lockfiles (standing project policy):
cd /Users/diniden/Desktop/self/pixel-art
! grep -qE '"[^"]+": *"[~^><*]' client/package.json server/package.json
test -z "$(find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules)"
```

Manual checks — **required, and not automatable**:

1. **Dev-server proxy:** `bun run dev:client`, then confirm a real `/api/...` request returns 200 and `/exports` static serving works. A broken proxy means the client cannot reach the server at all.
2. **StrictMode canvas smoke test** (this is the whole risk of React 19 here): draw a stroke; undo; redo the same stroke; toggle a layer's visibility; open the lighting studio and paint normals; scrub the timeline; trackpad-pinch and ctrl+wheel zoom on **both** `Canvas` and `LightingCanvas`. Watch for doubled event listeners (a single drag producing two strokes) or effects that clean up too early — those are the StrictMode failure signatures.
3. Confirm `bun run dev` still starts all three mprocs processes.

## Definition of done

- [ ] `react`, `react-dom` at 19.2.8; `@types/react` 19.2.18; `@types/react-dom` 19.2.4.
- [ ] `vite` 7.3.6 and `@vitejs/plugin-react` 5.2.0 (**not** 6.0.5).
- [ ] `typescript` 5.9.3 in **both** `client` and `server`.
- [ ] `zustand` untouched at its task-01-pinned `4.5.2`; `lucide-react` untouched.
- [ ] `bunx tsc --noEmit` exits 0 in both workspaces; `bun run build` exits 0 in `client`.
- [ ] **No lockfile exists anywhere** and **no `^`/`~` specifier** was introduced into either `package.json` — every upgraded version is written exactly.
- [ ] The StrictMode canvas smoke test was performed and its outcome recorded in the completion report.
