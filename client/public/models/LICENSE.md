# Third-party assets in `client/public/models/`

Provenance record for every vendored asset in this directory. Keep it accurate:
it is the only thing standing between this repo and an unattributable binary.

---

## `mannequin.gltf` — "Prototyping Mannequin"

| Field | Value |
| --- | --- |
| Asset name | **Prototyping Mannequin** |
| Author | **burning_barb** (itch.io user id 1249262) |
| Source URL | <https://burning-barb.itch.io/mannequin> |
| License | **Creative Commons Zero v1.0 Universal** |
| License URL | <https://creativecommons.org/publicdomain/zero/1.0/> |
| Price on the source page | "Name your own price" — a free download option is offered and was used |
| Uploaded by the author | 27 September 2022 @ 15:34 UTC |
| Downloaded / verified | **2026-09-03** |
| Originally verified | 2026-09-02 (plan `docs/06-pose-tool/`, decision D3) |

### License statement, verbatim

The asset's itch.io page states its licensing in the project metadata table as:

> Asset license
> Creative Commons Zero v1.0 Universal

CC0 1.0 Universal places the work in the public domain: it may be copied,
modified, distributed and used commercially, all without asking permission and
without attribution being required. The attribution recorded here is therefore
courtesy and traceability, not a licence obligation.

### Re-verification, 2026-09-03

Required by plan decision D3, which mandates that the licence be re-checked at
execution time rather than trusted from the planning note. Checked two ways:

1. The rendered page was fetched and read; it returned **HTTP 200**, is live,
   and its metadata table reports `Asset license: Creative Commons Zero v1.0
   Universal`.
2. The raw HTML was fetched independently and grepped: the only
   `Creative Commons` string present on the page is
   `Creative Commons Zero v1.0 Universal`. No secondary, conflicting or
   superseding licence text appears anywhere on the page.

The page's other metadata also still matches D3 exactly — author `burning_barb`,
`9.6k tris`, and the two offered files at the sizes recorded below — which is
corroborating evidence that this is the same asset the plan approved and not a
re-upload under the same URL.

### Files

Only `mannequin.gltf` is vendored. The page also offers `mannequin.blend`
(1.1 MB, the Blender source); it is **deliberately not vendored** — nothing at
runtime reads it, and it would triple this directory's weight.

| File | Bytes | Vendored |
| --- | --- | --- |
| `mannequin.gltf` | **380,956** (372 kB, as the source page states) | **yes** |
| `mannequin.blend` | ~1.1 MB | no — source file, unused at runtime |

Checksums of the vendored file, as downloaded (unmodified — the bytes committed
here are byte-for-byte what the source served):

```
SHA-256  d936e4b7602147f05b4fe5a6d712eebf0a575be154e66834c9a9e0e0ebabef44
MD5      7fb69d5c67dbcfc5e31d70173f04d371
```

### What is inside it

Measured by parsing the glTF JSON and decoding its vertex buffer, 2026-09-03:

| Property | Value |
| --- | --- |
| Format | glTF 2.0, JSON (`.gltf`), generator `Khronos glTF Blender I/O v3.2.43` |
| **External dependencies** | **None.** The single buffer is an embedded base64 `data:` URI (282,072 bytes decoded). There are **no `images` and no `textures`** entries, so there are no `.bin` or texture sidecars to vendor and nothing can 404 at runtime. |
| Triangles | **9,636** (matches the source page's "9.6k tris") |
| Meshes / nodes | 2 — `mannequin_joints` (mesh `joints`) and `mannequin_body` (mesh `body`), both with identity transforms |
| Vertices | 7,008 (1,270 joints + 5,738 body) |
| Materials | 2 slots — `joint_mat`, `body_mat`. Both are overridden at load time by the pose tool's flat model-colour material. |
| Rigging | **None** — no `skins`, no `animations`. This is why the "body part" buttons are camera framing presets (plan decision D4) rather than per-part meshes. |
| Pose | **T-pose** — arms held horizontally out to the sides at shoulder height. |
| Bounding box (model units) | x `[-0.760, 0.760]`, y `[-0.004, 1.708]`, z `[-0.069, 0.161]` — 1.519 wide × 1.712 tall × 0.230 deep, y-up, standing on approximately y = 0 |

The mesh is normalised to a centred unit box at load time, so these raw
dimensions do not reach the renderer; they are recorded because the framing
regions in `poseMeshes.ts` were derived from them.
