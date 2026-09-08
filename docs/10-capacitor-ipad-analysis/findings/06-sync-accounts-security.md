# 06 — Sync, accounts & encryption design

Threat-modeled design options for: device↔server and device↔device data sync
(password-protected, receive-side explicit opt-in), full server→device bulk pull,
email-keyed sandboxing without central email storage (MASTER D8), and optional at-rest
encryption. **Design only — no application code changes.** Six design areas, each with
Options and a Recommendation, then a composed overall Recommendation, a threat model,
and Gaps (G-601…).

Branch note: analysis performed against worktree `feat/09-ipad-pencil-fixes` @ `cb27aa0`
(the plan folder lives on `feat/10-capacitor-ipad-analysis`; the two differ only by the
plan folder itself). All `path:line` cites below verified against this worktree.

---

## Facts

Verified in this task (D9 — every claim carries `path:line` or a dated citation):

- **There is no auth anywhere.** `cors()` with no options (`server/src/index.ts:31`),
  `express.json({ limit: "50mb" })` (`server/src/index.ts:32`), no token/session/
  password/email concept in client or server. The server's own comment says the
  unauthenticated surface is acceptable "on a local dev server and nowhere else"
  (`server/src/index.ts:43-44`). It binds `::` — all interfaces, dual-stack
  (`server/src/index.ts:84`). The whole LAN is trusted today, by design.
- **The existing "sync" is not data sync.** `server/src/sync.ts` is a ws broadcast of
  `welcome` + `project-saved` notifications — "a notification, never a payload"
  (`server/src/sync.ts:8-9`), deliberately last-write-wins for a single-author tool
  (`server/src/sync.ts:19-23`), served at `/ws` on the HTTP port
  (`server/src/sync.ts:47,69-82`). It solves multi-tab reload hints. Everything in this
  document called "sync" is a **new, different mechanism**; nothing here reuses or
  changes `sync.ts`.
- **Data unit and persistence machinery.** One minified JSON file per project
  (`Base Unit.json` = 1,164,725 B, MASTER §4); writes are temp-file → read-back
  byte-compare → atomic rename (`server/src/backup.ts:74-100`); backups are md5-deduped
  (`backup.ts:36-38`), ≥5 min apart, ≤50/day (`backup.ts:22-23`), day-rolled into
  gzip level 9 archives (`backup.ts:105-157`). Backup dedupe state (`lastBackupHash`)
  is **in-memory only** (`backup.ts:26-31`) — nothing persists the md5.
- **Server API surface today:** config get/set, project list/get/save/create/rename/
  delete/switch, backups list/restore, migration-backup — all unauthenticated
  (`server/src/routes/project.ts:34-368`), plus `/health` and `/api/discovery`
  (`server/src/index.ts:51-76`).
- **The ios-companion probe contract (G-15):** every discovery strategy funnels through
  `GET /api/discovery` and requires `service === "pixel-art"`
  (`ios-companion/README.md:12-16`); it depends on the `::` bind and plain-HTTP local
  networking via `NSAppTransportSecurity.NSAllowsLocalNetworking`
  (`ios-companion/README.md:106-114`). This surface must keep working unauthenticated.
- **Client seam:** one fetch site (`client/src/api/client/httpClient.ts:155`),
  `API_BASE = import.meta.env.VITE_API_URL || "/api"`
  (`client/src/api/client/config.ts:8`), ws sync opt-in via `syncEnabled`
  (`client/src/stores/ApplicationStore.ts:865-869`). New sync UX can hang off the same
  barrel; no `ui/` change is forced by this design.
- **A webview cannot accept inbound connections** (GAPS G-04). This design treats it as
  a law of physics. Native-listener escape hatches (embedded HTTP-server plugins etc.)
  are **task 02's question 6** (`02-capacitor-platform-verification.md`, question 6) —
  findings not yet written at the time of this task (parallel W1); this document cites
  the question, asserts no plugin facts, and records the dependency as G-601.
- **WebCrypto surface:** SubtleCrypto supports AES-GCM, AES-KW, PBKDF2, HKDF, HMAC,
  ECDH, Ed25519/X25519, SHA-256/384/512 — and has **no Argon2 and no PAKE**
  (MDN SubtleCrypto, https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto,
  checked 2026-09-06). No MD5 either (GAPS G-05).
- **KDF parameter baselines:** OWASP Password Storage Cheat Sheet recommends Argon2id
  m=19456 KiB, t=2, p=1 (or listed equivalents) and PBKDF2-HMAC-SHA256 at 600,000
  iterations
  (https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html,
  checked 2026-09-06).
- **Candidate crypto dependencies** (versions from registry.npmjs.org, checked
  2026-09-06; every pin exact per house rule, `bun add --exact`):
  - `hash-wasm` **4.12.0** (published 2024-11-19) — WASM Argon2id for browsers
    (https://registry.npmjs.org/hash-wasm; https://www.npmjs.com/package/hash-wasm).
  - `@noble/hashes` **2.4.0** (published 2026-08-27) — audited pure-JS hashes/KDFs
    (Cure53 2022 + maintainer audits 2026;
    https://github.com/paulmillr/noble-hashes, checked 2026-09-06).
  - `@noble/ciphers` **2.4.0** (published 2026-08-27) — audited pure-JS AES/ChaCha
    (https://github.com/paulmillr/noble-ciphers, checked 2026-09-06).
  - `@serenity-kit/opaque` **1.1.0** (published 2026-02-01) — OPAQUE PAKE, WASM
    (https://github.com/serenity-kit/opaque, checked 2026-09-06).
  - `libsodium-wrappers` **0.8.4** (published 2026-04-19) — argon2id + secretstream
    (https://registry.npmjs.org/libsodium-wrappers, checked 2026-09-06).
  - Rejected as unmaintained: `spake2` 1.0.2 (last publish 2019-09-12),
    `argon2-browser` 1.18.0 (last publish 2021-06-05) — registry.npmjs.org, checked
    2026-09-06. **No maintained SPAKE2/CPace npm library was found** (WebSearch,
    2026-09-06); per the no-hand-rolled-primitives rule, SPAKE2 is therefore not
    implementable here without adopting OPAQUE instead.
- **Task 05 dependency:** the per-account VFS namespace layout is task 05's to own
  (`05-local-persistence-vfs.md`); its findings were not yet written when this task
  ran. Sections below design against the measured `server/src/data/` structure
  (`backup.ts:17-20`) and flag the dependency (G-613).

---

## Options

The six design areas. Each closes with its own **Recommendation**; the top-level
[Recommendation](#recommendation) composes them into one design.

### 1. Account model

**What "account" means here.** There is no registration, no central user database, no
third party. An account is: a normalized email held **only on the user's devices**, a
namespace on any server that has received that account's work, and an optional password.

**Email normalization.** Trim whitespace, Unicode NFC, lowercase the entire address.
Do **not** strip `+tags` or dots — guessing provider aliasing rules silently merges or
splits accounts. Normalization must be byte-identical on every platform or the same
email lands in two namespaces (DESIGN-RISK, folded into G-605's UX mitigations).

**Namespace key derivation — options:**

| Option | Mechanism | Trade-offs |
|---|---|---|
| A. Server-side keyed hash | Server generates a random 256-bit secret at first boot (`data/server-identity.json`); namespace = `HMAC-SHA-256(server_secret, email)` truncated to 128 bits hex. Email transits to the server inside the encrypted pairing channel, is HMACed in memory, and is never written down. | Strongest against enumeration: without the server secret, directory names reveal nothing, and even *with* a directory listing an attacker cannot test candidate emails. Same email → same namespace on that server (second device finds the work). Cost: the email does transit (in memory, encrypted in flight) — see the D8 interpretation note below. |
| B. Client-side hash, public salt | Server publishes a per-install random salt; client computes `SHA-256(salt ‖ email)` and only ever sends the digest. | Email never leaves the device at all — the strictest possible reading of D8. But the salt is necessarily public, so anyone who obtains a namespace listing can offline-test candidate emails (emails are low-entropy; a dictionary of plausible addresses is small). A memory-hard client-side KDF slows but does not stop this. |
| C. Random namespace ID | First pairing mints a random ID; devices store `email → ID` locally; email is a pure label. | No derivation from email at all — cryptographically the cleanest. But a second device with only the email **cannot find the namespace**: the ID must be re-entered or transferred, which recreates the pairing-transfer problem the email was supposed to solve, and an ID typo is worse than an email typo. |

**D8 validation.** The fixed requirement — email as namespace key, never centrally
stored — stands. The *mechanism* refinement this task proposes is HMAC with a
server-held secret (Option A) rather than a plain salted hash: a salted hash whose salt
must be available to clients (Option B) is offline-enumerable, which defeats the
privacy purpose of hashing at all. Option A depends on reading "never centrally store"
as "never persist" (the email exists transiently in server memory during pairing). If
the owner intends the strict "never transmit" reading, Option B is the fallback and its
enumerability is the accepted cost. **This interpretation is G-605, a
PRODUCT-DECISION.**

**The email-typo failure mode — addressed, not ignored.** Because the server cannot
enumerate emails (that is the point of D8), it also cannot say "did you mean…". A typo
on a second device deterministically lands in a fresh, empty namespace and looks like
"my work is gone". Mitigations, all UX-level:

1. **Empty-namespace tripwire.** The pull flow's first step is a manifest request
   (area 4). If the user chose "sync my existing work" and the manifest comes back
   empty, the UI must stop hard: "No work found for this email on this server — check
   the spelling" with the typed email displayed, not silently create the namespace.
   Namespace directories are created lazily on first *write*, never on read.
2. **Double-entry** of the email on first account setup on each device.
3. **Manifest preview before any write:** show project names + counts from the target
   namespace and require confirmation, so pushing into the wrong (occupied) namespace
   is also visible.
4. Server CLI can list namespace hashes with project counts and last-write times (no
   emails — it has none), so the owner can spot an orphaned typo-namespace and delete
   it.
5. PRODUCT-DECISION (part of G-605): may the server store a user-chosen display label
   per namespace (e.g. "Din's iPad work")? It aids recognition and is not an email,
   but it is user-identifying data the strict design avoids.

**Multi-account per device:** support one *active* account with a switcher; all local
data partitioned per account under the VFS root (layout owned by task 05, G-613).
Nothing in the crypto design prevents N accounts; the UI cost is the reason to ship
one-active-at-a-time first.

**The "password-protect my work" toggle** is per-account and yields two independent
keys from one password via HKDF domain separation (`info = "pixel-art/at-rest/v1"` vs
`"pixel-art/sync-auth/v1"`): an at-rest key (area 2) and a sync-auth key (areas 3–4).
With the toggle **off**, device data is plaintext and sync is protected only by the
pairing window's code — the toggle governs *user secrets*, the pairing window governs
*connection admission*; they are orthogonal and both are needed.

**Recommendation.** Option A (server-side HMAC-SHA-256 with a first-boot server
secret, 128-bit truncated hex namespace), lazy namespace creation on first write, the
empty-namespace tripwire and manifest preview as mandatory UX, one active account per
device in v1. All primitives are native WebCrypto (HMAC, HKDF) — zero dependencies for
this area.

### 2. At-rest encryption

Scope: project JSON files, config, and backups in the device VFS (and, if the owner
enables it server-side, the same code path applies to a namespace's files on a
standalone server — the design is target-agnostic because it operates on strings/bytes
at the `safeWriteFile` seam, `backup.ts:74-100`).

**Cipher: no options needed.** AES-256-GCM via WebCrypto (`crypto.subtle.encrypt`) —
native, hardware-accelerated, zero dependencies (MDN cite in Facts). A 1.16 MB payload
is a single-shot encrypt, far below GCM limits; fresh 96-bit IV from
`crypto.getRandomValues` per write, never reused (IV reuse in GCM is catastrophic —
this goes in the implementation plan as a review checkpoint, G-614). File envelope:
`magic ‖ format-version ‖ KDF-id ‖ KDF-params ‖ salt ‖ IV ‖ ciphertext` so parameters
can evolve without a migration crisis.

**Key derivation — options:**

| Option | Dep (exact pin) | Trade-offs |
|---|---|---|
| A. PBKDF2-HMAC-SHA256, 600k iter (OWASP) | none — WebCrypto native | Zero bundle cost, zero supply chain. Not memory-hard: a GPU attacker who steals ciphertext brute-forces low-entropy passwords orders of magnitude faster than against Argon2id. Iteration cost on an iPad webview unmeasured (G-609). |
| B. Argon2id via `hash-wasm` **4.12.0** | ~small WASM; last publish 2024-11-19 | Memory-hard (OWASP baseline m=19456 KiB, t=2, p=1). Maintenance is adequate but not active; WASM must be bundled (no CDN — Capacitor offline). Cost on iPad unmeasured (G-609). |
| C. Argon2id via `libsodium-wrappers` **0.8.4** | larger bundle | Brings a whole crypto suite when only the KDF is missing; overkill next to B. |
| D. Argon2id via `@noble/hashes` **2.4.0** (pure JS) | audited, tiny | Pure-JS Argon2 is slow, which perversely forces *weaker* parameters on the defender; noble's own docs steer Argon2 users to WASM. Keep noble as the audited fallback if hash-wasm is ever abandoned. |

**Key lifecycle.** Derive a KEK from the password once per app launch ("unlock at
boot"); per-save prompting is unusable against debounced autosave. The KEK wraps
(AES-KW) a random 256-bit DEK that actually encrypts files — so password change =
re-wrap one 40-byte blob, not re-encrypt every file and backup. DEK lives in webview
memory for the session; there is **no secure enclave reachable from JS** — Keychain
storage of the wrapped DEK would need a native plugin, which is task 02 territory
(question 3/6 adjacent; recorded as G-611, no plugin facts asserted here). Memory-only
keys are the honest v1.

**Migration plaintext→encrypted** (toggle flipped on): per file — encrypt to temp,
decrypt-verify the temp (mirroring the existing read-back byte-compare discipline,
`backup.ts:81-88`), atomic rename over the plaintext, then continue to the next file.
Existing plaintext `.gz` backup archives are re-encrypted the same way, oldest last, so
an interruption leaves a cleanly resumable half-migrated state (envelope magic makes
encrypted files self-identifying). Toggle-off is the reverse and requires the password.

**Honest failure mode — forgotten password = data loss.** With no central service and
no escrow, a forgotten password makes every encrypted byte permanently unreadable.
This is a **PRODUCT-DECISION (G-604)**, not something an agent may soften silently.
Options for the owner: (a) no recovery — maximum honesty, the toggle's enable dialog
says "there is no reset; lose the password, lose the work"; (b) opt-in recovery code —
at enable time generate a random 128-bit code rendered as words, wrap the DEK a second
time under a key derived from it, tell the user to print it (recovery = second wrap
slot in the envelope; standard multi-recipient key wrapping, no new primitives);
(c) cloud escrow — rejected, contradicts the no-central-storage spirit.
Recommendation within the gap: (b) offered, default-on-screen but skippable.

**Interplay with backup dedupe (G-05/G-606).** AES-GCM with a fresh IV makes
ciphertext differ on every write, so hashing ciphertext would defeat the md5 dedupe
(`backup.ts:36-38`) and the 5-minute/50-per-day throttles would stop suppressing
no-op backups. Fix: hash the **plaintext** before encryption. Dedupe state is
in-memory only (`backup.ts:26-31`, verified — nothing persists the hash), so a
plaintext hash leaks nothing to disk. Same opportunity to retire md5 for SHA-256 on
both targets (WebCrypto has no MD5, G-05). Also: compress **before** encrypting —
ciphertext is incompressible, so the day-roll gzip (`backup.ts:133`) must move inside
the encryption envelope for encrypted namespaces.

**Recommendation.** WebCrypto AES-256-GCM + AES-KW envelope with a wrapped DEK;
Argon2id via `hash-wasm@4.12.0` (exact pin) at OWASP m=19456 KiB/t=2/p=1, with
PBKDF2-600k (WebCrypto-native) as the automatic fallback if WASM init fails; unlock at
boot, memory-only keys; plaintext-hash dedupe; recovery code as the owner-decided
option (G-604). Parameters get an on-device timing measurement before they are frozen
(G-609).

### 3. Pairing & receive windows (G-13)

The requirement: the receiving side must **explicitly** open itself to a sync, for a
bounded time, with a shared code, and shrug off junk traffic. This section designs the
admission mechanism; area 4 uses the session key it produces.

**Who can receive.** A standalone server can listen — it already does. An iPad
**cannot** (G-04): a webview only originates connections. Consequences:

- **device→server and server→device:** the device always dials the server. Fully
  supported; the "receive window" lives on the server even for server→device pulls
  (the *operation* is authorized by the window; bytes flow whichever way).
- **device↔device direct:** the receiving iPad would need a native listener plugin —
  whether a maintained one exists is exactly **task 02's question 6**, and per MASTER
  §8 this task does not assert plugin facts from memory. Design options that need no
  new platform facts: (a) **relay through a standalone server** both devices dial out
  to (sender pushes into a one-shot relay slot opened by the receiver's window;
  receiver pulls; server sees only ciphertext if the peers used the pairing-derived
  key), or (b) **scope direct device↔device out of v1**. Recorded as G-601; the
  recommendation below assumes (a)/(b) until 02's findings say otherwise.

**Window mechanics (either receiver).** A window is opened by an explicit local act:
on the server, a CLI command (`bun run pair` — prints the code to the terminal the
owner is sitting at) or a loopback-only admin route; on an iPad (as relay-mediated
receiver), a button in the app. Opening generates: a fresh random window salt, a
pairing code, a TTL (default 2 minutes), and an attempt budget (default 3). While no
window is open, all pairing endpoints answer a cheap constant 404 — the "spam a
server with nonsense" surface when idle is one string compare. Windows are single-use:
first successful pairing, expiry, or budget exhaustion closes them.

**Code verification — options:**

| Option | Deps | Trade-offs |
|---|---|---|
| A. True PAKE: OPAQUE via `@serenity-kit/opaque` **1.1.0** | WASM, actively maintained (2026-02 release) | Cryptographically ideal: even a MitM who captures the whole transcript learns nothing testable offline, so short human-friendly codes are safe. Cost: OPAQUE is designed for *persistent* password accounts (registration + login records), which is ceremony this ephemeral window doesn't need; a WASM dependency on both ends including the Bun server. |
| B. SPAKE2/CPace | none maintained | `spake2@1.0.2` last published 2019-09-12 (registry, checked 2026-09-06); no maintained CPace lib found. Hand-rolling a PAKE is forbidden. **Not available.** |
| C. High-entropy code + WebCrypto-native challenge/response | none | Code = 6 Diceware-style words (~77 bits) displayed on the receiver. Both sides derive `K = HKDF(PBKDF2(code, window_salt, 600k), transcript_hash)`; prove possession by mutual HMAC over the transcript (receiver proves first); K then keys the AES-GCM session (area 4). Weakness vs a PAKE: a transcript captor can brute-force the code offline — mitigated not by ceremony but by entropy: at ~77 bits + PBKDF2-600k stretching, offline search is impractical. This is the Magic-Wormhole trade inverted: they use SPAKE2 to make weak codes safe; lacking a maintained SPAKE2, we use strong codes to make simple, native, reviewable crypto safe. Composition of standard primitives (PBKDF2/HKDF/HMAC/AES-GCM — all WebCrypto), not a new primitive; composition risk logged as G-614. |

**Rate limiting & replay.** Per-IP token bucket on pairing endpoints; constant-time
comparisons; window closes on budget exhaustion (a guesser gets 3 tries against a
77-bit code, then the human notices their window died); the window salt makes every
transcript unique, so nothing replays across windows; session keys are bound to the
transcript hash, so a spliced transcript fails the mutual HMAC.

**Recommendation.** Option C for v1 — zero dependencies, every primitive native on
both the webview and Bun, and the receiving human explicitly opens every window.
Adopt OPAQUE (`@serenity-kit/opaque@1.1.0`, exact pin) only if the owner later wants
*persistent* password login to a hosted server (G-612 territory), where its
registration model earns its weight. Device↔device: relay-through-server in v1,
direct mode contingent on task 02's question 6 findings (G-601).

### 4. Sync protocol

Explicitly not `sync.ts` (Facts). This is a new, window-authorized, session-encrypted
transfer protocol for project data between a device and a server namespace (or two
devices via relay).

**Granularity — options:** whole-file per project; per-project deltas; CRDT merge.
Deltas/CRDTs are rejected with prejudice: the project format has eight schema
migrations and byte-identical round-trip obligations (CLAUDE.md); a structural merge
engine over that format is a product-sized liability for a single-author tool whose
own ws layer already chose last-write-wins semantics (`sync.ts:19-23`). Whole-file
matches the storage unit, the migration model, and the existing safety machinery.

**Conflict handling.** Per-namespace sync manifest (`manifest.json` beside the
projects; layout final say is task 05's, G-613): `{project: {sha256, size, mtime,
lastSyncMarker}}`. On push, the sender includes the hash it last synced against; if
the receiver's current hash differs (both ends changed), the receiver (a) runs the
existing backup machinery on its current copy first — `runBackupForProject`
(`routes/project.ts:131-134` shows the call pattern) — then (b) applies
last-write-wins. Argued: this leans on the one safety mechanism the app has proven
for months (149 snapshots of real work); a "conflict copy" file would instead invent
a second, unmigrated recovery path the UI has no story for. The clobbered version is
one Browse-Backups click away. The overwrite response tells the sender
`{ conflicted: true, backupCreated: true }` so the UI can say so.

**Resumability at ~1.16 MB on flaky Wi-Fi — options:** (a) gzip + whole-file retry:
minified pixel JSON should compress well (ratio unmeasured, G-610), an interrupted
transfer restarts that one project; (b) content-addressed 256 KB chunk upload with
offset resume. Recommendation: (a) for v1 — the failure unit is one project and the
retry cost is a few hundred KB; (b) is designed-in as envelope room (transfer-id +
offset fields) but unimplemented until G-610's measurement says otherwise. Integrity:
whole-payload SHA-256 verified before the receiving side's atomic
`safeWriteFile`-style commit; GCM auth catches tampering, the hash catches truncation
and app bugs.

**Bulk pull (server→device, "send EVERYTHING").** Manifest request → client-driven
per-project GETs, resumable at project granularity, each committed atomically on the
device before the next starts; a progress UI over N projects falls out for free.
Scope of "everything": projects + config yes; backup archives are a PRODUCT-DECISION
(they multiply transfer size and exist for disaster recovery, which the server still
holds) — folded into G-608's decision batch.

**Transport & confidentiality.** LAN reality: the standalone server is plain HTTP —
there is no viable certificate story for `192.168.x.x`, and ios-companion already
required `NSAllowsLocalNetworking` for exactly this reason
(`ios-companion/README.md:113-114`). Whether `capacitor://localhost` origins impose
further ATS/CORS constraints on plain-HTTP LAN fetches is **task 02's question 2**
(cited, not asserted; G-603). Therefore confidentiality is application-layer: every
sync request/response body is AES-256-GCM under the pairing session key, with a
per-message counter in the AAD (no counter reuse per key; sequence enforced — replay
of a captured sync request is rejected). URLs and metadata (that a sync is happening,
namespace hash, payload sizes) remain visible to a LAN observer — stated honestly in
the threat model. Internet exposure of a raw server is **out of scope for v1**; if
wanted, real TLS via reverse proxy is the answer (G-612, PRODUCT-DECISION).

**Recommendation.** Whole-file, gzip-then-encrypt, manifest-driven; last-write-wins
with backup-before-overwrite on divergence; project-granular resumability with chunk
fields reserved; app-layer AES-GCM over plain HTTP on LAN; bulk pull = manifest +
sequential atomic per-project pulls.

### 5. Server-side changes

**Coexistence rule (the default that keeps existing users working):** every one of
the 24 existing routes, `/health`, `/api/discovery`, `/exports`, and `/ws` stays
exactly as it is — unauthenticated, LAN-trusting. The ios-companion probe contract
(G-15) is untouched. The entire accounts/sync feature is **additive and default-off**
(env flag, e.g. `SYNC_ACCOUNTS=1`). Two consequences the owner must see: (1) the
legacy no-auth surface remains writable by any LAN peer even when accounts are on —
the new feature protects the *namespaced* subtree, not the legacy one; gating the
legacy routes behind auth would break every existing client and is a PRODUCT-DECISION
(G-607). (2) The existing un-namespaced `data/*.json` corpus is the owner's local
workspace; whether it retroactively maps into a namespace is part of the same
decision.

**New surface (all under the feature flag):**

| Endpoint | Window required | Purpose |
|---|---|---|
| CLI `bun run pair` / loopback-only `POST /api/admin/pair-window` | is the act | Open a receive window; prints code + TTL |
| `POST /api/pair/start` | yes | Challenge/response round 1 (window salt, transcript init) |
| `POST /api/pair/verify` | yes | Mutual HMAC proof; issues short-lived session token bound to namespace + session key |
| `GET /api/sync/manifest` | session | Namespace manifest (drives typo tripwire + preview) |
| `GET/PUT /api/sync/project` | session | Encrypted whole-file transfer |
| `POST /api/sync/relay/*` | session (receiver's window) | One-shot relay slots for device↔device (v1 path per area 3) |

Session tokens are random 256-bit, in-memory on the server, TTL ≈ the sync operation
(default 15 min), bound to one namespace. Nothing long-lived is issued in the default
design: **window per operation** is the verbatim reading of the owner's requirement
("the remote server would also need to explicitly open up the connection … for the
operation"). A remembered-devices fast path (persistent device token, hashed at rest
under the namespace) is ergonomically tempting and deliberately left to the owner —
G-608, PRODUCT-DECISION.

**Server-held state added:** `data/server-identity.json` (first-boot HMAC secret,
0600), per-namespace subtree (final layout: task 05, G-613) holding projects, config,
backups, manifest — all optionally encrypted with the same envelope as area 2 when
the account's password toggle is on (the server then stores ciphertext it cannot
read: the at-rest key derives from the user password the server never sees post-PAKE…
post-challenge). Express-level additions (rate limiting, constant-time compares,
body-size caps on pairing routes) ride the existing middleware chain
(`index.ts:31-48`); nothing about the `ServerPlatform` adapter (MASTER D3) is
disturbed — the new routes use the same `fs/gzip/hash` adapter members as
`backup.ts`.

**Recommendation.** Additive, flag-gated surface as tabled; window-per-operation
default; legacy surface untouched pending G-607; server identity secret at first
boot; per-namespace subtrees deferred to task 05's layout.

### 6. Threat model

Scope statement, honestly: this design protects a hobbyist's real work against LAN
snoops, nosy housemates, device theft, and internet background radiation — **not
against nation-states, forensic labs, or a compromised OS.**

| Adversary | Capability | Mitigation | Residual risk |
|---|---|---|---|
| Passive LAN snoop | Reads all plain-HTTP traffic | Sync payloads AES-256-GCM under pairing session key; pairing never transmits the code | Metadata visible: that a sync happened, namespace hash, sizes, timing. Legacy-route traffic (non-sync editing against a remote server) is plaintext as today |
| Active LAN MitM | Intercepts/modifies/injects | Mutual HMAC over transcript (both sides prove code possession); GCM auth + sequence AAD rejects tampering/replay | MitM can DoS (drop/garble). A transcript captor may attempt offline code search — impractical at ~77 bits + 600k stretch, but weaker than a true PAKE (G-614) |
| Port scanner / spam bot (LAN or port-forwarded) | Floods endpoints with junk | Windows closed by default (constant cheap 404); token-bucket rate limits; 3-attempt budget; single-use windows | Legacy no-auth routes remain fully open to the LAN (G-607); a port-forwarded server exposes them to the internet — explicitly unsupported (G-612) |
| Nosy housemate, device in hand (locked/off) | Reads device storage via backups/jailbreak/filesystem | At-rest AES-256-GCM when password toggle on; Argon2id makes password guessing expensive | Toggle off = plaintext. Weak passwords fall to patient guessing. iOS full-disk protection is the real first line; we add depth |
| Thief with *unlocked, running* app | Uses the app | Nothing in scope — DEK is in memory, app is open | Total. OS auto-lock is the mitigation; app-level re-lock timer is possible future work |
| Compromised server host | Root on the box | If password toggle on, namespace files are ciphertext the server cannot read (key never stored server-side); HMAC secret exposure enables email *testing* only, not recovery | Plaintext namespaces (toggle off) fully exposed; traffic-time metadata; a *persistently* compromised server can tamper with future pairing (trust-on-first-pair) |
| Malicious/mistaken sync peer with a valid code | Authorized write access for one window | Single-use, time-boxed, human-read code; backup-before-overwrite means clobbers are recoverable from Browse Backups | Whoever holds an open window's code IS the peer for that operation — code hygiene is the human's job |
| Server operator (honest-but-curious host of a shared server) | Reads disk, watches traffic | D8: no emails stored, namespaces are HMAC-opaque; encrypted namespaces unreadable | Operator sees IPs, sizes, activity patterns; can delete data (availability is not defended) |
| Nation-state / forensics / OS compromise | Everything | **Non-goal.** Stated to the owner as such | All of it |

**Explicit non-goals:** availability under DoS; anonymity; multi-writer merge
correctness; protection of the legacy no-auth surface (unless G-607 decides
otherwise); side-channel resistance inside the webview; supply-chain compromise
beyond exact-pinned, audited dependencies.

---

## Recommendation

One design, composed from the six areas: **accounts are local-only emails HMAC-mapped
(server-secret, SHA-256) to lazily-created namespaces, with a typo tripwire that
refuses to invent an empty namespace on a pull; at-rest protection is opt-in
AES-256-GCM with a wrapped DEK, Argon2id (`hash-wasm@4.12.0`) keyed from the user's
password, plaintext-hash backup dedupe, and a PRODUCT-DECISION recovery-code slot;
admission is a human-opened, single-use, ~2-minute receive window with a ~77-bit
spoken-word code driving a WebCrypto-native mutual-HMAC handshake (no maintained PAKE
lib fits v1; OPAQUE `@serenity-kit/opaque@1.1.0` is the named upgrade path);
transfers are whole-file, gzip-then-GCM, manifest-driven, last-write-wins with
backup-before-overwrite on divergence; the server gains only additive, flag-gated
endpoints and a first-boot identity secret while every existing route — including the
ios-companion probe — stays byte-for-byte as it is.** Device↔device sync ships as
relay-through-server; direct mode waits on task 02's question 6. The only new
dependency in the v1 critical path is `hash-wasm@4.12.0` (exact pin, `bun add
--exact`); every other primitive is native WebCrypto on the webview and Bun sides.
This is deliberately a *product-sized* feature — MASTER §9 already predicts it —
and nothing above blocks the core port: the entire area can trail the port as a later
phase, which is what task 08 should schedule.

---

## Gaps

Local numbering G-6xx per MASTER D7; task 07 merges. Format per D6.

### G-601 · BLOCKER · A receiving iPad cannot accept a sync connection
**Evidence:** GAPS G-04 (no listening-socket API in webview JS); `sync.ts:69-82` is a
Node `WebSocketServer`, non-portable; task 02 question 6
(`02-capacitor-platform-verification.md`) owns the native-listener plugin question and
its findings were not yet written when this task ran.
**Impact:** Direct device↔device sync has no receive side in pure web code; only
originate-only flows work on the iPad.
**Special measure:** v1 ships device↔device as relay-through-standalone-server (both
peers dial out; receiver's window authorizes the slot) or scopes direct mode out;
revisit when 02's question 6 findings land. Task 08 must sequence any direct-mode task
behind 02's answer.
**Status:** OPEN

### G-602 · BLOCKER · WebCrypto has no memory-hard KDF and no PAKE
**Evidence:** MDN SubtleCrypto supported-algorithms (checked 2026-09-06) — no Argon2,
no PAKE; maintained-library survey (registry.npmjs.org, checked 2026-09-06):
`spake2@1.0.2` (2019) and `argon2-browser@1.18.0` (2021) are dead; no maintained CPace
lib found.
**Impact:** Password hashing at OWASP-recommended strength and PAKE-grade pairing both
require dependencies; hand-rolling is forbidden.
**Special measure:** `hash-wasm@4.12.0` (Argon2id, exact pin) with WebCrypto
PBKDF2-600k fallback; pairing uses high-entropy codes + native primitives instead of a
PAKE; `@serenity-kit/opaque@1.1.0` named as the upgrade path if persistent password
login is ever wanted.
**Status:** OPEN

### G-603 · DESIGN-RISK · Plain-HTTP LAN transport bounds confidentiality; ATS facts owed by task 02
**Evidence:** Server is plain HTTP on `::` (`index.ts:84`); ios-companion required
`NSAllowsLocalNetworking` (`ios-companion/README.md:113-114`); no certificate story
exists for LAN IPs; Capacitor-origin ATS/CORS behavior is task 02 question 2 (findings
pending at time of writing).
**Impact:** Only sync payloads are confidential (app-layer GCM); URLs, sizes, timing,
and all legacy-route traffic are observable on the LAN. If 02 finds ATS blocks
plain-HTTP fetches from the Capacitor origin, the sync transport needs the same
Info.plist allowance ios-companion uses.
**Special measure:** App-layer AES-GCM as designed; carry the ATS check into the
implementation plan as a hard dependency on 02's findings.
**Status:** OPEN

### G-604 · PRODUCT-DECISION · Forgotten password = permanent data loss (recovery policy)
**Evidence:** Design area 2: no central service exists to reset against (D8); DEK is
derivable only from the password.
**Impact:** With encryption on and the password gone, the owner's work is
cryptographically unrecoverable. Someone must choose the failure mode.
**Special measure:** Owner picks: (a) no recovery, loud warning at enable time;
(b) opt-in printed recovery code (second AES-KW wrap slot — no new primitives);
(c) escrow — recommended against. Task 07 carries this to DECISIONS-NEEDED.md.
**Status:** OPEN

### G-605 · PRODUCT-DECISION · Email-typo recovery and the strictness of "never centrally store"
**Evidence:** Design area 1: HMAC namespaces are non-enumerable by construction, so
the server cannot suggest corrections; Option A has the email transit in memory during
pairing, Option B never transmits it but is offline-enumerable via the public salt.
**Impact:** A typo on a second device silently means "my work is gone" unless the UX
tripwires fire; the D8 interpretation (never *persist* vs never *transmit*) changes
the mechanism.
**Special measure:** Mandatory empty-namespace tripwire + manifest preview +
double-entry (area 1); owner decides: Option A vs B, and whether a user-chosen
display label per namespace may be stored server-side.
**Status:** OPEN

### G-606 · DESIGN-RISK · Encryption breaks backup dedupe and compression unless ordered correctly
**Evidence:** md5 dedupe over content (`backup.ts:36-38`); dedupe state in-memory only
(`backup.ts:26-31`); day-roll gzip level 9 (`backup.ts:133`); GCM fresh-IV ciphertext
differs every write; ciphertext is incompressible. (Refines seeded G-05.)
**Impact:** Naive ciphertext hashing voids the 5-min/50-per-day backup throttles;
gzip-after-encrypt produces bloated archives.
**Special measure:** Hash plaintext pre-encryption (and take the chance to move both
targets to SHA-256, retiring md5); compress-then-encrypt in the backup path. Verify
during implementation that no md5 ever persisted (verified in-memory today).
**Status:** OPEN

### G-607 · PRODUCT-DECISION · The legacy no-auth surface stays open even with accounts enabled
**Evidence:** 24 unauthenticated routes (`routes/project.ts`, `index.ts:39-48`);
ios-companion probe contract requires unauthenticated `/api/discovery`
(`ios-companion/README.md:12-16`); GAPS G-15.
**Impact:** Any LAN peer can still read/write the *un-namespaced* legacy data while
the shiny new namespace is locked — a real, easily-misunderstood asymmetry. Gating
legacy routes breaks every existing client.
**Special measure:** Default: leave legacy surface untouched (accounts additive,
flag-gated). Owner decides whether/when legacy routes get gated and whether the
existing `data/*.json` corpus maps into a namespace.
**Status:** OPEN

### G-608 · PRODUCT-DECISION · Window-per-operation vs remembered devices; bulk-pull scope
**Evidence:** Owner requirement verbatim: server "explicitly open[s] up the connection
… for the operation" (MASTER §1); design area 5.
**Impact:** Strict reading = a human opens a window for every sync (safest, most
ceremony). Remembered-device tokens remove ceremony but create long-lived credentials
the requirement never asked for. Separately: whether bulk pull includes backup
archives.
**Special measure:** Ship strict default; owner opts into remembered devices and sets
bulk-pull scope in DECISIONS-NEEDED.md.
**Status:** OPEN

### G-609 · NEEDS-MEASURE · KDF cost on real iPad hardware
**Evidence:** OWASP params (checked 2026-09-06) are server-class guidance; no
measurement exists of Argon2id 19 MiB/t=2 or PBKDF2-600k inside WKWebView on the
owner's iPad; memory note in MASTER §4 (task 02 question 8, webview memory ceiling).
**Impact:** Too-slow = unlock jank at boot; too-weak = paper armor. Cannot be frozen
from a desk.
**Special measure:** Implementation plan includes a timing probe on-device before
parameters are pinned in the envelope format (which is versioned precisely so they
can move).
**Status:** OPEN

### G-610 · NEEDS-MEASURE · Compressed project transfer size and flaky-Wi-Fi behavior
**Evidence:** `Base Unit.json` = 1,164,725 B (MASTER §4); gzip ratio of minified pixel
JSON unmeasured; whole-file-retry vs chunked-resume decision (area 4) hangs on it.
**Impact:** If compressed projects are large or the Wi-Fi failure rate is high,
whole-file retry becomes user-hostile and the reserved chunk fields must be
implemented in v1.
**Special measure:** Measure gzip ratio + transfer failure behavior during
implementation; envelope reserves transfer-id/offset fields either way.
**Status:** OPEN

### G-611 · DESIGN-RISK · No secure key storage reachable from webview JS
**Evidence:** Design area 2: DEK/session keys live in JS memory; Keychain/secure
storage requires a native plugin — plugin availability/maintenance is task 02
territory (questions 1/6 adjacent), not asserted here.
**Impact:** Keys are exposed to any XSS/compromise of the webview for the session's
duration; "remember my password" cannot be offered safely without native help.
**Special measure:** v1 = memory-only keys, re-derive at boot; revisit Keychain-backed
wrapped-DEK storage when 02's plugin findings land.
**Status:** OPEN

### G-612 · PRODUCT-DECISION · Internet exposure is out of scope for v1
**Evidence:** Design areas 4/6: plain-HTTP server, no TLS story, legacy routes
unauthenticated (`index.ts:31-48,84`).
**Impact:** Port-forwarding this server to the internet exposes the whole legacy
surface to the world; the sync feature's app-layer crypto does not fix that.
**Special measure:** Documented as unsupported; if the owner wants internet sync,
front with a TLS reverse proxy (and then OPAQUE/persistent auth becomes worth
re-evaluating). Owner sign-off required to schedule any of it.
**Status:** OPEN

### G-613 · NEEDS-MEASURE · Namespace layout depends on task 05's VFS findings
**Evidence:** Task 05 owns the persistence/VFS layout
(`05-local-persistence-vfs.md`); its findings were not yet written when this task ran;
this design assumed the measured `server/src/data/` shape (`backup.ts:17-20`).
**Impact:** The per-namespace subtree (`data/namespaces/<hmac>/…`, manifest placement,
per-account device partitioning) sketched here may need reshaping to 05's chosen
backing.
**Special measure:** Task 07 reconciles this file against 05's findings; task 08 makes
05's layout the single source for paths.
**Status:** OPEN

### G-614 · DESIGN-RISK · The pairing handshake is a composition, and compositions are where crypto dies
**Evidence:** Design area 3 Option C: PBKDF2→HKDF→mutual-HMAC→AES-GCM with sequence
AAD — every primitive standard and native, the *composition* project-specific because
no maintained PAKE library exists (G-602).
**Impact:** IV reuse, transcript-binding mistakes, or non-constant-time compares would
quietly void the security argument; nothing in CI catches protocol-logic errors.
**Special measure:** The implementation plan must include: written protocol spec with
test vectors, both-sides interop tests, an explicit review checkpoint before merge,
and the OPAQUE upgrade path kept warm. If that discipline feels heavy, that is the
correct signal to pay the OPAQUE dependency cost instead — decided at implementation
time, recorded here so task 08 schedules one or the other explicitly.
**Status:** OPEN
