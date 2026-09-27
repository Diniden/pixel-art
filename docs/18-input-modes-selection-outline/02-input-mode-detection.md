# 02 — `InputMode` detection

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/canvas/model/inputMode.ts` (new) · `client/src/ui/canvas/model/__tests__/inputMode.test.ts` (new)
**Effort:** S

## Objective

A pure, injectable detector answers "which input conventions does this device use?" with one of
`"ipad" | "mac" | "windows"`. A per-device `localStorage` override can replace the answer.
Nothing consumes it yet. Tasks 05 and 07 will.

## Context

- **Locked decisions:** MASTER D1–D4. Read them. They settle the order, the fallback and the
  storage key.
- **Analogues to copy for style and guards:**
  - `client/src/ui/layout/deviceClass.ts:57-75` (`detectDeviceClass`): `typeof window` guard,
    `matchMedia` guard.
  - `client/src/ui/utils/pointerDevice.ts:37-50` (`isTouchDevice`): `matchMedia` in try/catch, and
    a `maxTouchPoints` fallback.
  - `client/src/ui/canvas/model/canvasTouchFilter.ts`: a pure input module with long why-comments.
- **Why touch comes first.** iPadOS Safari and WKWebView report `navigator.platform === "MacIntel"`
  and a Mac-like UA. `navigator.maxTouchPoints > 1` (5 on an iPad, 0 on a Mac) and
  `(pointer: coarse)` are what tell them apart.
- **Why "everything else → mac".** This covers Linux, unknown platforms and **jsdom**. The `"mac"`
  semantics equal today's behaviour (plain wheel pans, ctrl+wheel zooms), so nothing
  unidentified changes, and every existing wheel test keeps its meaning when the mode is left at
  the default (MASTER §4.1: in jsdom `navigator.platform` is `""` and `matchMedia` is undefined).
- **Why sniffing the platform is acceptable here** when `pointerDevice.ts`'s header forbids UA
  sniffing: that file asks whether the primary pointer is a finger, which feature detection
  answers. This file asks which OS's wheel conventions apply, which is a question about the
  platform. Put this contrast in the header so the next reader doesn't "fix" it.
- **The unit lane runs in node**, not jsdom (`client/vitest.config.ts`: `*.test.ts` is `unit` and
  `*.dom.test.ts` is `dom`). Test `detectInputMode(env)` with plain objects and never touch
  globals.

## Steps

1. Create `client/src/ui/canvas/model/inputMode.ts`:
   ```ts
   export const INPUT_MODES = ["ipad", "mac", "windows"] as const;
   export type InputMode = (typeof INPUT_MODES)[number];
   export const INPUT_MODE_STORAGE_KEY = "pixelart.inputMode";
   export function isInputMode(v: unknown): v is InputMode;
   export interface InputEnv {
     override: string | null;        // raw localStorage value
     coarsePointer: boolean;         // matchMedia("(pointer: coarse)").matches
     maxTouchPoints: number;
     platform: string;               // navigator.platform ?? ""
     uaPlatform: string | null;      // navigator.userAgentData?.platform ?? null
   }
   export function detectInputMode(env: InputEnv): InputMode;
   export function readInputEnv(): InputEnv;    // every access guarded; SSR/node-safe
   export function currentInputMode(): InputMode; // detectInputMode(readInputEnv())
   ```
   - The order in `detectInputMode` is: a valid override; then `coarsePointer || maxTouchPoints > 1`
     gives `"ipad"`; then `uaPlatform === "Windows" || /^Win/i.test(platform)` gives `"windows"`;
     else `"mac"`.
   - An invalid override (any string that is not a mode) is **ignored**, not thrown.
   - In `readInputEnv`, wrap `localStorage.getItem` in try/catch (it throws in some privacy modes)
     and wrap `matchMedia` in try/catch. `navigator.userAgentData` is not in every TS lib, so read
     it through a narrow local interface cast.
2. Write the header comment. Cover: the three modes and what each means for the user (a one-line
   pointer to `wheelIntent.ts`, which task 05 creates, is fine as "see wheelIntent.ts"); the
   detection order and why; the override and how to set and clear it from devtools; and the
   jsdom → `"mac"` consequence.
3. Create `client/src/ui/canvas/model/__tests__/inputMode.test.ts`. Cover at least:
   - iPad: `{ platform: "MacIntel", maxTouchPoints: 5, coarsePointer: true }` → `"ipad"`.
   - iPad with coarse false but 5 touch points → `"ipad"`.
   - Mac: `{ platform: "MacIntel", maxTouchPoints: 0, coarsePointer: false }` → `"mac"`.
   - Windows via `platform: "Win32"` → `"windows"`, and via `uaPlatform: "Windows"` → `"windows"`.
   - A Windows touch laptop in tablet mode (coarse) → `"ipad"`. Document this in the test as
     intended: touch conventions win.
   - Linux (`"Linux x86_64"`) → `"mac"`. Empty env → `"mac"`.
   - Override `"windows"` on a Mac env → `"windows"`. Override `"bogus"` → it is ignored.
   - `isInputMode`.
   - `readInputEnv()` in the node lane returns a well-formed object without throwing.
4. Run the verification, then **commit** as `feat(18/02): InputMode detection`.

## Constraints

- Pure `ui/`: no store, no MobX, no `api/`. No React in this file.
- Do not edit `pointerDevice.ts` or `deviceClass.ts`. They answer different questions.
- No UI, no store field, and no project persistence (D4).

## Verification

```sh
cd client
bunx tsc --noEmit
bunx vitest run src/ui/canvas/model/__tests__/inputMode.test.ts
bunx eslint src/ui/canvas/model
bun scripts/check-boundaries.mjs
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # nothing
```

Manual: none. The module has no consumer yet, and task 08 covers it on real devices.

## Definition of done

- [ ] `inputMode.ts` exports exactly the API above.
- [ ] Every case in step 3 is tested and green.
- [ ] tsc, eslint and the boundary check are clean, and there is no lockfile.
- [ ] Committed.
