# 09 — Vendor the CC0 mannequin asset

**Wave:** W4 · **Depends on:** 06, 08
**Touches:** `client/public/models/mannequin.gltf` (new, binary-ish asset) · `client/public/models/LICENSE.md` (new) · `client/src/ui/canvas/pose/poseMeshes.ts`
**Effort:** M

## Objective

The **Mannequin** button loads a real human-figure reference mesh, and the six framing
buttons (Full / Head / Torso / Arm / Leg / Hand) frame the correct regions of it. The asset
is CC0, its provenance is recorded in the repo, and the framing regions are tuned against
the actual mesh rather than estimated.

**This task may legitimately end BLOCKED.** It is deliberately last and isolated so that the
whole feature ships with primitives if the asset cannot be obtained or its license cannot be
re-verified. Do not substitute an unverified asset to avoid a BLOCKED status.

## Context

**The asset (MASTER D3), verified 2026-09-02:**

| Field | Value |
| --- | --- |
| Source | `https://burning-barb.itch.io/mannequin` ("Prototyping Mannequin") |
| License | **Creative Commons Zero v1.0 Universal (CC0)** |
| Files offered | `mannequin.gltf` (372 kB), `mannequin.blend` (1.1 MB) |
| Triangles | 9,600 |
| Rigging | **None** — a single unrigged mesh |
| Materials | 2 slots |
| Price | "Name your own price", free option available |

**Why unrigged matters, and why there are no per-part meshes.** The request asked for
"buttons for human pose models: head, body, etc." Because this mesh has no skeleton and no
named sub-objects to rely on, MASTER D4 implements those buttons as **camera framing presets
over the one mesh** — each frames a normalised sub-box of the mannequin's bounds. Task 06
already declared `MANNEQUIN_REGIONS` with **estimated** proportions. Your job here includes
**tuning them against the real mesh**.

⚠️ **You are adding a downloaded third-party asset to the owner's repository.** That is an
outward-facing, hard-to-reverse action.

- **Ask the owner to confirm before committing the asset.** Show them the source URL, the
  license, the file size, and where it will live. If you cannot get confirmation, record
  BLOCKED.
- **Re-verify the license at execution time.** It was CC0 on 2026-09-02; confirm it still
  says CC0 on the page today. If the page is gone, the license changed, or it cannot be
  reached, **stop and record BLOCKED** — do not silently swap in a different model.
- Prefer the `.gltf`; `client/public/` is served statically by Vite, so
  `/models/mannequin.gltf` is the runtime URL. Do **not** put it in `src/`.
- ⚠️ A `.gltf` may reference **external `.bin` and texture files**. If it does, they must be
  vendored alongside it or the load will 404 at runtime. Check the file's `buffers` and
  `images` entries. If it turns out to need many sidecar files, note it — a self-contained
  `.glb` would be preferable and you should say so rather than shipping a broken reference.
- `server/src/data/` and `server/exports/` are gitignored; `client/public/` is **not** —
  this asset will be committed. Confirm it is not caught by any ignore rule.

**Loading.** Task 06 defined the seam `loadMannequin(three, url)`. Implement it with
`GLTFLoader` from `three/examples/jsm/loaders/GLTFLoader.js`, reached through the
lazily-loaded three namespace — **no module-level runtime three import**. The loader is a
separate deep import; confirm it does not defeat the lazy chunking (task 03's bundle check).

**Graceful failure is already the contract.** Task 06 required `loadMannequin` to reject
cleanly when the asset is absent. Keep that: a missing file must show the user something
sensible, not a blank canvas or a thrown error.

**Normalisation.** Like the primitives, the loaded mesh must be normalised to a unit
bounding box centred on the origin so `fitCameraToMesh` has one code path. The source mesh's
scale and origin are unknown until you load it — compute its bounding box and transform it.

**Material.** The mesh ships with 2 material slots. Override both with the flat model-colour
material so the model colour control works, matching the primitives' look.

## Steps

1. **Re-verify the license.** Fetch `https://burning-barb.itch.io/mannequin` and confirm it
   still states CC0. Record what you found, with the date, in `HANDOFF.md`. If it is not
   CC0 → **BLOCKED, stop.**
2. **Ask the owner** to confirm downloading and committing the asset, showing source,
   license, size and destination. No confirmation → **BLOCKED, stop.**
3. Download `mannequin.gltf` to `client/public/models/`. Inspect it for external `buffers`
   and `images` references and vendor any sidecar files it needs. Verify it parses as JSON
   and record its actual size.
4. Write `client/public/models/LICENSE.md` recording: the asset name, the source URL, the
   author, the **verbatim** license statement ("Creative Commons Zero v1.0 Universal"), the
   date verified, and the file list. This is the provenance record.
5. Implement `loadMannequin` in `poseMeshes.ts` with `GLTFLoader`: load, compute the bounding
   box, normalise to a centred unit box, override both materials with the model colour,
   return the `Object3D`. Keep the graceful rejection path.
6. **Tune `MANNEQUIN_REGIONS`** against the real mesh. Load it in the running app, select
   each framing button, and adjust the normalised sub-boxes until each framing actually
   frames the named body part with reasonable padding. Replace task 06's "approximate,
   tune in task 09" comment with a note that they are now measured.
7. Update `poseMeshes.test.ts` if the region invariants changed (they should still hold:
   inside the unit box, `min < max`, `"full"` is the unit box).
8. Run the full verification and the manual checks. **Commit after step 8**:
   `feat(pose): vendor the CC0 mannequin and tune its framing regions`.

## Constraints

- **Do not commit the asset without owner confirmation.**
- **Do not substitute a different model** if this one is unavailable — record BLOCKED.
- Do not vendor the `.blend` source (1.1 MB, unused at runtime).
- No module-level runtime three import; keep the lazy chunk intact.
- Do not touch `poseCamera.ts`, `poseStamp.ts`, `poseEngine.ts`, `CanvasContainer.tsx`, or
  any panel file. `poseMeshes.ts` is your only source edit.
- Do not create a lockfile.
- The primitives must keep working unchanged whether or not the mannequin loads.

## Verification

From `client/`:

```sh
bunx tsc --noEmit                                   # exit 0
bunx eslint .                                       # 0 errors
bunx vitest run                                     # all pass
bun run lint:boundaries                             # OK
bunx stylelint "src/**/*.css"                       # exactly 2 errors
bun run build                                       # succeeds
```

From the repo root:

```sh
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules    # nothing
ls -lh client/public/models/                                    # asset + LICENSE.md present
git check-ignore -v client/public/models/mannequin.gltf         # must NOT be ignored
```

**Manual checks:**

1. Select Pose → **Mannequin**. A human figure loads, auto-fitted and centred like the
   primitives, and visibly pixelated.
2. Each framing button (Full / Head / Torso / Arm / Leg / Hand) frames the correct body
   part with sensible padding.
3. The model colour control changes the mannequin's colour (proving the material override).
4. Rotation, light, camera presets, pan and stamp all work on the mannequin exactly as on
   the primitives.
5. Stamping the mannequin produces a recognisable figure silhouette in one undo entry.
6. Switch between Mannequin and a primitive repeatedly — no leak warnings, no stale geometry.
7. **Temporarily rename the asset file** and confirm the app degrades gracefully (no crash,
   no blank canvas, a sensible outcome), then restore it. This is the graceful-failure check.
8. Confirm the three/GLTFLoader chunk is still lazy — not fetched until the tool is used.

## Definition of done

- [ ] The license was **re-verified at execution time** and the result recorded with a date.
- [ ] The owner **explicitly confirmed** committing the asset (or the task is BLOCKED).
- [ ] `client/public/models/mannequin.gltf` (plus any required sidecars) is committed and is
      not gitignored.
- [ ] `client/public/models/LICENSE.md` records source, author, verbatim license, date and
      file list.
- [ ] `loadMannequin` loads, normalises to a centred unit box, overrides both materials, and
      still fails gracefully when the file is absent.
- [ ] `MANNEQUIN_REGIONS` are **tuned against the real mesh** and the stale "approximate"
      comment is replaced.
- [ ] All 8 manual checks performed and recorded.
- [ ] Full gate green; lazy chunking intact; no lockfile.
- [ ] One commit, containing only this task's hunks.
- [ ] **If BLOCKED:** `HANDOFF.md` records exactly what failed, and the plan is still
      complete with primitives only.
