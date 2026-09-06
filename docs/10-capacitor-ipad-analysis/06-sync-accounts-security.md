# 06 — Sync, accounts & encryption design

**Wave:** W1 · **Depends on:** none
**Touches:** `docs/10-capacitor-ipad-analysis/findings/06-sync-accounts-security.md` (new)
**Effort:** L

## Objective
A threat-modeled design-options analysis for the entire security surface of the request:
device↔server and device↔device sync (password-protected, receive-side explicit
opt-in), full server→device data pull, email-keyed sandboxing without central email
storage, and optional at-rest encryption. Written to
`findings/06-sync-accounts-security.md`. This is the least-constrained-by-existing-code
task — and therefore the one where writing down what the stack *cannot* do matters most.

## Context
Hard facts (MASTER §4; verify what you use):
- **There is no auth anywhere.** `cors()` wide open, no tokens/sessions/passwords, the
  server trusts its LAN (`server/src/index.ts:43-44` says so in as many words). You are
  designing on greenfield — but the existing no-auth LAN mode is what current users
  (and ios-companion's probe) rely on; breaking it is a PRODUCT-DECISION, not a default.
- **A webview cannot listen** (G-04). The receiving side of device↔device sync must be
  native-plugin, relay-through-server, or out of scope for v1. Cite task 02's findings
  (question 6) for what native options exist rather than asserting.
- Existing sync (`server/src/sync.ts`) is a notification-only ws broadcast — it is NOT
  a data-sync mechanism and solves a different problem (multi-tab reload hints). Don't
  conflate them; state this explicitly since the word "sync" collides.
- Data unit: whole-project JSON files (~1.16 MB) + backups + config, laid out per task
  05's namespace (cite their findings file for the layout; if not yet written, design
  against `server/src/data/`'s structure and flag the dependency).
- Requirement fixed by MASTER D8: email = namespace key, never centrally stored;
  server-side sandboxing via salted hash. Validate or overturn *with rationale* — e.g.
  the recovery problem (salted hash ⇒ server can't enumerate accounts ⇒ what happens
  when the user typos their email on a second device?) must be addressed, not ignored.

Design areas (one section each):
1. **Account model.** Email normalization, derived namespace key (salt: whose? stored
   where?), multi-account on one device?, the "password-protect my work" toggle and
   what it protects (device at rest? sync in flight? both?).
2. **At-rest encryption.** WebCrypto AES-GCM over project files before they hit the
   VFS; key derivation (PBKDF2 iterations vs argon2-wasm — cost on an iPad, bundle
   weight); key lifecycle (unlock at boot? per-save? memory-only?); the unencrypted→
   encrypted migration path; **honest failure modes** (forgotten password = data loss —
   PRODUCT-DECISION on recovery, e.g. none vs recovery-code). Note interplay with
   backup dedup hashing (G-05) — hashes of ciphertext change every write.
3. **Pairing & receive windows** (G-13). Time-boxed window opened explicitly on the
   receiving side (server CLI/route; iPad UI), short-code verification (PAKE-style e.g.
   SPAKE2, or pragmatic TLS-less HMAC challenge — weigh implementability in the
   browser against real threat level: LAN peers + optional internet exposure), rate
   limiting, and replay/spam resistance for the "bad actors spamming servers" concern.
4. **Sync protocol.** Whole-file vs per-project vs delta; conflict handling when both
   ends changed (last-write-wins + backup-before-overwrite leans on the existing
   backup machinery — attractive, argue it); resumability at 1 MB+ payloads on flaky
   Wi-Fi; the "send EVERYTHING server→device" bulk pull; transport (HTTPS? plain HTTP
   on LAN + the pairing-derived key for confidentiality? — remember ATS constraints,
   cite task 02 question 2).
5. **Server-side changes.** New endpoints/surface the standalone server needs, how the
   no-auth LAN mode coexists (default-off accounts? per-namespace opt-in?), and what
   ios-companion's probe contract needs preserved (G-15).
6. **Threat model.** A table: adversary → capability → mitigation → residual risk.
   Include the honest scope statement: this protects against LAN snoops and nosy
   housemates, not nation-states; say what it does NOT defend.

## Steps
1. Read `sync.ts`, `routes/project.ts`, `backup.ts` (skim), `index.ts`,
   `ios-companion/README.md`; verify the facts above.
2. Write the six design sections, each with Options + a Recommendation.
3. Extract every "the stack can't do this without special measures" item into Gaps
   (G-601…): expect at least — no inbound listeners (webview), no raw TCP/TLS control
   from JS, WebCrypto's missing primitives (no argon2, no PAKE built-in ⇒ wasm/js deps
   with pinned versions), plain-HTTP secrecy limits under ATS, salted-hash-vs-recovery
   tension.
4. Write `findings/06-sync-accounts-security.md` per MASTER D5.

## Constraints
- Findings file only; no GAPS.md edits (D7); no source edits.
- Defensive design only: mechanisms to *protect* the owner's data. No exploit
  development; when describing the spam/abuse threat, describe mitigations, not attack
  tooling.
- Don't re-litigate MASTER D8's fixed requirement (no central email storage) — design
  within it; overturning is only for the *salted-hash mechanism*, with rationale.
- Cryptographic recommendations must name pinned library versions and cite them (D9);
  never propose hand-rolled primitives.

## Verification
```sh
test -s docs/10-capacitor-ipad-analysis/findings/06-sync-accounts-security.md
grep -q 'Threat model' docs/10-capacitor-ipad-analysis/findings/06-sync-accounts-security.md
grep -q '^## Gaps' docs/10-capacitor-ipad-analysis/findings/06-sync-accounts-security.md
git status --porcelain | grep -v 'docs/10-capacitor-ipad-analysis' | grep . && echo DIRTY || echo CLEAN
```
Manual: all six design areas present with Options AND Recommendation; the
forgotten-password and email-typo failure modes are explicitly addressed; the threat
model states residual risks honestly.

## Definition of done
- [ ] Six design sections, each Options + Recommendation
- [ ] Threat-model table incl. explicit non-goals
- [ ] Data-loss/recovery failure modes addressed as PRODUCT-DECISION gaps where owner
      input is required
- [ ] All crypto deps pinned + cited; no hand-rolled primitives anywhere
- [ ] G-04/G-13 given concrete special measures or scoped out with rationale
- [ ] Tree clean outside this folder
