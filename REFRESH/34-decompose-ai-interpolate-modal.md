# 34 — Decompose `AIInterpolateModal` into a shell, 6 steps, and 2 parts

**Wave:** W25 · **Depends on:** 32, 19, 15
**Touches:** `client/src/components/AIInterpolateModal/AIInterpolateModal.{tsx,css}` (moved) · `client/src/ui/components/AIInterpolate/{AIInterpolateModal.tsx,steps/*.tsx,parts/*.tsx}` (new) + stories · `client/src/containers/AIInterpolateContainer.tsx` (new) · `client/src/containers/hooks/useInterpolationJob.ts` (new) · `client/src/ui/utils/frameEncoding.ts` (new) · `client/src/stores/domain/applyInterpolation.ts` (new) · `client/src/stores/bridge/zustandBridge.ts`
**Effort:** L

## Objective

After this task the 1,252-line `AIInterpolateModal` — which had the worst store coupling in the codebase — is a container plus 6 pure step components, 2 pure parts, one job hook, one pure encoder, and one store action. Every step is Storybook-able.

## Context

### What is fused in the file

| Concern | Lines | Size |
| --- | --- | --- |
| Three near-identical base64 renderers: `renderLayerToBase64` (38-66), `renderFrameToBase64` (68-107), `renderVariantFrameToBase64` (109-147) | 38-147 | **~70 duplicated** — same canvas/`ImageData`/alpha-composite scaffold, differing only in the source walk |
| Two inline sub-components: `Base64Thumbnail` (190-210), `SyncedAnimatedPreview` (212-290) | 190-290 | 100 |
| A 6-state step machine | line 27 | — |
| Health-check polling | 318-348 | 30 |
| 9 derived `useMemo`s | 350-541 | 191 |
| `handleGenerate` — job submission + polling | 543-679 | 136 |
| **`handleAccept` — a 182-line commit routine** | 681-862 | **182** |
| Hand-rolled backdrop click handling | 863-874 | 11 |

Hook census: 14 `useState`, 7 `useEffect`, 8 `useRef`, 5 `useCallback`, 12 `useMemo`.

### Coupling that earlier tasks already removed

- **`const store = useEditorStore()` at line 316** — the whole store object.
- **Two direct `useEditorStore.setState()` calls** at lines 754 and 841, hand-rolling the `projectHistory` splice **without** the `MAX_HISTORY` cap. **Task 14 fixed this.**
- **Two direct `scheduleAutoSave` calls** at lines 766-767 and 853-854, bypassing the store. **Task 14 fixed this.**
- **Five array-rank type errors** at lines 692, 720, 736, 785, 815 — `PixelData[]` used where `PixelData[][]` is required. **Task 02 fixed these.** They lived inside `handleAccept`.
- **API calls** to `services/aiService.ts`. **Task 15 replaced these with `aiApi`**, including bounded polling with a required `AbortSignal`.

**Verify each of those four fixes is still in place before starting** — they are prerequisites, not part of this task.

### Target structure

```
client/src/ui/components/AIInterpolate/
  AIInterpolateModal.tsx        — the shell: step orchestration only (~200 lines), PURE
  steps/CheckingStep.tsx        — PURE
  steps/UnavailableStep.tsx     — PURE
  steps/SelectLayerStep.tsx     — PURE
  steps/ConfigureStep.tsx       — PURE (keyframes + settings tabs)
  steps/GeneratingStep.tsx      — PURE (per-pair progress)
  steps/ReviewStep.tsx          — PURE
  parts/Base64Thumbnail.tsx     — PURE (from 190-210)
  parts/SyncedAnimatedPreview.tsx — PURE (from 212-290)
client/src/ui/utils/frameEncoding.ts         — PURE: ONE parameterised encoder replacing all three (38-147)
client/src/containers/hooks/useInterpolationJob.ts — submit + poll + pair-job state (it calls the API, so it lives in containers/hooks/, NOT ui/hooks/)
client/src/stores/domain/applyInterpolation.ts     — the 182-line accept, as a store action
client/src/containers/AIInterpolateContainer.tsx   — the observer()
```

Note the deliberate placement of `useInterpolationJob`: pure DOM/gesture hooks live in `ui/hooks/` and obey the import ban, but **anything that fetches or reads a store lives in `containers/hooks/`**. If a hook is ambiguous, the ESLint rule decides it — a hook that trips the `ui/` ban belongs outside.

### `frameEncoding.ts` — one encoder replacing three

The three renderers share the same scaffold: create a canvas, build an `ImageData`, alpha-composite the layers, and produce base64. They differ only in **which source they walk** (a layer, a frame, or a variant frame). Parameterise the walk.

**This must be byte-equal to the current output.** Write a byte-equality test against the current implementation for a fixture layer, a fixture frame and a fixture variant frame **before** switching, because the AI service consumes these images and a subtle encoding change would silently degrade interpolation quality.

Note this file also contains one of the codebase's **five** alpha-compositing implementations (lines 90-99). Task 30 unified the others onto `utils/alphaBlend.ts` — use that here too.

### `applyInterpolation` — the 182-line accept

It writes interpolated frames back into the project, so it is a **domain mutation** and belongs in the store, not in a component. Task 02 fixed its array-rank bug; **write the test to assert `pixels` is `PixelData[][]`** so it cannot regress.

It must go through `HistoryStore` like any other domain mutation. Given it can add many frames at once, wrap it in a **transaction** so accepting an interpolation is **one** undo entry. Given the volume, it is a **snapshot-family** command.

### Story CSS

Task 09 deleted 8 dead job-status classes from `AIInterpolateModal.css` (`.queued`, `.processing`, `.completed`, `.failed`, `.generated`, `.placeholder`, `.ai-btn-preview`, `.between`/`.keyframe`) — they were CSS with no markup emitting them, likely a regression from an earlier AI-service refactor. Task 22 BEM-converted the file to the `ai-interpolate-modal` block. **When rebuilding the per-pair progress UI in `GeneratingStep`, re-attach the status styling as proper `--{status}` modifiers** so the feature works rather than merely existing in CSS.

### Modal chrome

Adopt the `Modal` primitive from task 19. It already implements the correct backdrop-close behaviour — tracking the mousedown origin so a drag-release outside does not close the modal — which this file was, notably, the **only** one in the codebase to get right (lines 863-874). Confirm the primitive preserves it.

## Steps

1. Verify the four prerequisite fixes (tasks 02, 14, 15) are in place.
2. Extract `frameEncoding.ts` as one parameterised encoder; **write the byte-equality test first** for a layer, a frame and a variant frame, then switch.
3. Extract `applyInterpolation` into `stores/domain/`, wrapped in a history transaction as a snapshot command, with a test asserting `pixels` is `PixelData[][]`.
4. Extract `useInterpolationJob` into `containers/hooks/`, using `aiApi.pollJob` with its required `AbortSignal`.
5. Extract `Base64Thumbnail` and `SyncedAnimatedPreview` into `parts/`.
6. Extract the 6 step components, each pure, taking props and emitting callbacks.
7. Reduce `AIInterpolateModal.tsx` to a ~200-line pure shell built on the `Modal` primitive, and create `AIInterpolateContainer`.
8. Re-attach the job-status modifiers in `GeneratingStep`.
9. Write stories: shell + 6 steps + 2 parts = 9 story files.

## Constraints

- **`frameEncoding` output must be byte-identical** to the current three implementations.
- **Everything under `ui/components/AIInterpolate/` must be pure** — no store, no API, no MobX, no `useContext`.
- `useInterpolationJob` goes in `containers/hooks/`, **not** `ui/hooks/`.
- Accepting an interpolation must be **one** undo entry.
- Do not reintroduce direct `setState` or `scheduleAutoSave` calls.
- Do not change the AI service's wire contract.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run build && bunx storybook build
bunx vitest run src/ui/utils/frameEncoding    # byte-equality for layer/frame/variant-frame
bunx vitest run src/stores/domain             # applyInterpolation asserts PixelData[][]
! grep -rn "useEditorStore\|from \"mobx\|stores/\|api/" src/ui/components/AIInterpolate
```

Manual checks — **requires a running `ai-service`**:
1. Full flow: open the modal → health check → select a layer → configure → generate → review → **accept**. Confirm the frames land correctly with real pixel content (this is what task 02's array-rank fix changed).
2. Accept an interpolation, then press undo **once** — all the added frames must disappear together.
3. Start a job and **close the modal mid-run** — polling must stop (the network panel goes quiet). This is `aiApi.pollJob`'s required `AbortSignal`.
4. Run interpolation 5× and confirm history stays within budget and the app stays responsive.
5. Confirm the per-pair status styling now renders (the re-attached modifiers).
6. Drag from inside the modal and release outside — the modal must **not** close.
7. All 9 stories render with no store provider.

## Definition of done

- [ ] `AIInterpolateModal.tsx` is a ~200-line pure shell under `ui/components/AIInterpolate/`, with 6 pure steps and 2 pure parts.
- [ ] One parameterised `frameEncoding.ts` replaces all three encoders, with byte-equality tests.
- [ ] `applyInterpolation` is a store action wrapped in a history transaction; accepting is one undo entry; a test asserts `pixels` is `PixelData[][]`.
- [ ] `useInterpolationJob` lives in `containers/hooks/` and uses `aiApi.pollJob` with a required signal.
- [ ] Nothing under `ui/components/AIInterpolate/` imports a store, the API, or MobX.
- [ ] The job-status modifiers are re-attached and visibly render.
- [ ] The `Modal` primitive preserves the mousedown-origin backdrop behaviour.
- [ ] 9 story files exist and render with no store provider.
- [ ] The full AI flow was exercised against a live `ai-service` and recorded.
