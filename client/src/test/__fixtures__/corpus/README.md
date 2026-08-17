# Round-trip corpus — the owner's real artwork

## ⚠️ The `*.json` files here are GITIGNORED — regenerate them before running the corpus suites

**Owner decision, 2026-08-16.** The corpus is **149 MB** of real artwork and the repo's
entire history is ~8 MB. Git history is effectively permanent, so the JSON is not
committed. What **is** committed, and what constitutes the actual regression gate, is the
set of **SHA-256 digest snapshots** in `client/src/types/__tests__/__snapshots__/`.

**A fresh clone has an empty corpus directory and cannot run the corpus suites until you
regenerate it.** `corpusFiles()` **throws** in that state rather than returning `[]` — a
suite that iterates zero files would report PASS while verifying nothing.

### Regenerate

```sh
cd /Users/diniden/Desktop/self/pixel-art
D=client/src/test/__fixtures__/corpus
cp "server/src/data/Base Unit.json"  "$D/base-unit.json"
cp "server/src/data/Test Blend.json" "$D/test-blend.json"
for f in server/src/data/backups/*.gz; do
  gunzip -c "$f" > "$D/backup-$(basename "$f" .gz).json"
done
cd client && bunx vitest run src/types/__tests__/
```

If a digest snapshot then differs, **that is a real regression in the serialization
layer — read the diff. Do NOT run `vitest -u`.**

---

**These files are copies of the owner's real work.** They are byte-significant.
Do not reformat them, do not "clean them up", and do not regenerate them.
`.prettierignore` excludes `**/__fixtures__/**` precisely so a formatting sweep
can never mutate a golden.

Source (READ ONLY — never write back to it):

| Corpus file | Copied from |
| --- | --- |
| `base-unit.json` | `server/src/data/Base Unit.json` (1,129,965 bytes) |
| `test-blend.json` | `server/src/data/Test Blend.json` (29,922 bytes) |
| `backup-<date>.json` | `gunzip -c server/src/data/backups/<date>.gz` |

Each `backup-*.json` is a **map of snapshot-name → CompactProject**, not a single
project. There are 9 archives holding **149 snapshots** between them, plus the two
standalone project files, for **151 projects total**.

| Archive | Snapshots |
| --- | --- |
| `backup-01-31-2026.json` | 50 |
| `backup-02-01-2026.json` | 18 |
| `backup-02-07-2026.json` | 10 |
| `backup-02-08-2026.json` | 41 |
| `backup-02-09-2026.json` | 12 |
| `backup-02-10-2026.json` | 6 |
| `backup-02-23-2026.json` | 2 |
| `backup-02-24-2026.json` | 6 |
| `backup-02-25-2026.json` | 4 |
| **Total** | **149** |

---

## ⚠️ MEASURED 2026-08-16 — no pre-migration data survives anywhere in this repo

All 9 archives were decompressed and classified. **Re-verified independently while
executing task 07, directly against the files in this directory.** The result:

| Signal | Result across all 149 snapshots |
| --- | --- |
| `"variantGroups"` | **0 occurrences** → M6 (object→project variants) already applied everywhere |
| `"variantOffset"` | **0 occurrences** → M5 already applied everywhere |
| Pixel encoding | `[color, normal, height]` **tuples throughout**. Verified non-zero samples: `[1883250943,8848702,1]` in `01-31-2026`, `[336530175,0,0]` in `02-25-2026` → M2 (legacy scalar → tuple) already applied everywhere |
| `"baseFrameOffsets"` | **present throughout** (1,315 occurrences in the oldest archive) → M4 already applied |
| `"version"` | **`"1.1.0"` in every archive** |

**The oldest surviving backup is already fully migrated.**

### Therefore: no migration in M1–M8 has any real-file coverage.

**Every migration fixture in `client/src/types/__tests__/migrations.test.ts` and
`server/src/__tests__/normalizePixel.test.ts` is hand-authored synthetic data**,
constructed by reading each detector and transform and building the minimal input
that exercises it. There is no real-data safety net behind any of the 8 migrations.

**Do not repeat this search.** It has been done twice. There is nothing to find.

### What that means for the four known migration bugs

M2 is not array-safe; M2's detection samples exactly one pixel; M4 hard-codes `10`;
M5 drops offsets when `selectedVariantId` is absent — plus M6 existing as two
divergent implementations. Because no real pre-migration data exists, these
**cannot be validated against reality at all**. They are pinned as characterisation
tests asserting the current, buggy behaviour. **No task in the REFRESH plan fixes
them.** Any future fix requires a purpose-built synthetic corpus *and* explicit
owner sign-off first.

---

## What this corpus is actually for

Not migrations — **serializer round-trip stability**. For all 151 projects:

- `compactToProject(projectToCompact(p))` is stable, and
- `projectToCompact(compactToProject(c))` is byte-identical to `c`.

Measured while writing task 07: **151/151 stable on both counts.**

That round trip is load-bearing twice over. It is not only the save/load path, it
is **also the deep-clone mechanism for undo** — `client/src/store/index.ts:57-58`
and `:88-89`, and `client/src/store/projectActions.ts:182-183` and `:216-217` all
snapshot history through it. **A field that does not survive the round trip is
silently lost on undo, not just on reload.**

## Why the regression gate uses SHA-256 digests, not `toMatchSnapshot()`

Task 07's spec asked for `expect(result).toMatchSnapshot()` over all 149 snapshots.
**That was measured and is not implementable.** A vitest snapshot of the *runtime*
(expanded) form of `test-blend.json` — the smallest file in the corpus — is
**780,687 bytes from 29,922 bytes of input, a 26× expansion**. Extrapolated across
the 149 MB corpus that is roughly **4.1 GB of `.snap` files**.

That fails the spec's own manual check, which requires a human to review every
committed snapshot by eye. Nobody reviews 4.1 GB.

The tests therefore pin a **SHA-256 digest of the canonical JSON** of each result as
an *inline* snapshot. This is the same regression gate — any byte that changes
anywhere in the owner's data flips the digest and fails the build — but it is a few
hundred reviewable lines instead of gigabytes. The digests are committed and frozen.

**A digest that changes is a change to real user data. Read it; never `-u` it.**
