# 02 — Capacitor platform verification (research + spike)

**Wave:** W1 · **Depends on:** none
**Touches:** `docs/10-capacitor-ipad-analysis/findings/02-capacitor-feasibility.md` (new) · scratch spike **outside the repo only**
**Effort:** M

## Objective
Every platform capability the port depends on is verified against *current* (2026)
Capacitor/WebKit/iOS reality — by web research with dated citations and, where cheap, an
actual spike — and recorded in `findings/02-capacitor-feasibility.md`. This task exists
because the single highest risk in MASTER §9 is stale training-data assertions about
what WKWebView and Capacitor can do.

## Context
The app this must host: React 19 + Vite 7 SPA, MobX, canvas-heavy (300k-cell pixel
grids), Apple Pencil input (see memory: WKWebView already in use via ios-companion;
Pencil hover is unsupported on the owner's hardware; pencil/finger exclusivity was fixed
natively). Server logic will be compiled into the webview (MASTER D2/D3). Storage scale:
a 1.16 MB project JSON, ≤50 backups/day, 264 small PNGs per export run.

Questions other tasks are blocked on (they will cite your findings instead of guessing):

1. **Capacitor current major version + iOS minimum**, and whether iPadOS multitasking /
  Stage Manager imposes constraints. Exact pinned versions for `@capacitor/core`,
  `@capacitor/cli`, `@capacitor/ios`, `@capacitor/filesystem`, `@capacitor/preferences`.
2. **Webview origin + scheme** on iOS (`capacitor://localhost`?): consequences for CORS
  to a LAN FastAPI service over plain HTTP (ATS! — ios-companion needed
  `NSAllowsLocalNetworking`), for cookies/storage partitioning, and for absolute `/api`
  URLs (G-12).
3. **Storage backings** (feeds task 05, G-07): Is OPFS (`navigator.storage.getDirectory`)
  available and persistent in WKWebView-in-app? Does it expose timestamps? IndexedDB
  eviction rules inside a Capacitor app vs Safari's 7-day rule? Capacitor Filesystem
  plugin: which iOS directory maps to "app-private, not user-visible Files app"
  (`Directory.Data`? `Library`?), per-call bridge overhead order-of-magnitude, and
  whether it can stream or only base64 strings across the bridge (matters at 1 MB+).
4. **Serving local files by URL** (G-08): does `convertFileSrc`/WKURLSchemeHandler let
  `<img src>`/fetch load app-storage files, and can a custom scheme serve a whole tree?
5. **mDNS from Capacitor** (G-02): does a maintained community plugin exist (name,
  version, last release, iOS support incl. `NSBonjourServices`), or is a custom plugin
  the honest answer? Both browse and advertise sides.
6. **Inbound listeners** (G-04): confirm no Capacitor-blessed way exists for a webview
  app to accept connections; note any native-plugin options (e.g. embedded HTTP server
  plugins), with maintenance status.
7. **Toolchain vs house rules** (G-11): can the Capacitor CLI run via Bun
  (`bun x @capacitor/cli`)? Does it write a lockfile? CocoaPods vs SPM on current
  Capacitor? Xcode version needed vs this machine (macOS Darwin 25.6 → check installed
  Xcode with `xcodebuild -version`).
8. **Background/large-work behavior:** webview JS throttling when app is backgrounded
  (matters for autosave), memory ceiling for a webview on iPad (matters for export
  rasterization + three.js already in the bundle), Web Worker availability.

## Steps
1. Research questions 1–8 with WebSearch/WebFetch. Every claim gets a citation (URL +
   "checked 2026-09-06"). Prefer official Capacitor docs/release notes and WebKit
   release notes over blog posts.
2. Spike what is cheap to verify locally, **in a fresh directory outside the repo**
   (your session scratchpad): `bun x @capacitor/cli@<pinned> init` a throwaway app, add
   iOS, observe lockfile behavior, CLI-under-Bun behavior, and record the generated
   project shape (where `webDir` points, config file format). Do NOT run device builds
   or simulators if slow — CLI behavior is the point. If the spike can't run (no
   network, missing Xcode), record each blocked check as NEEDS-MEASURE gaps rather than
   guessing.
3. After any `bun x`/`bunx` usage, run the lockfile check **in the repo** and confirm
   clean: `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules`.
4. Write `findings/02-capacitor-feasibility.md` per MASTER D5: Facts (cited), Options
   where alternatives exist (e.g. storage backings comparison table), Recommendation
   (the platform configuration you'd bet on), Gaps (G-201, G-202, …) for everything
   unverifiable from here (device-only measurements land here explicitly).

## Constraints
- The repo working tree stays byte-identical: no installs, no config edits, nothing —
  the spike lives entirely outside. Only your findings file is created inside.
- Pin exact versions in recommendations (house rule: no `^`/`~` anywhere, `--exact` on
  any future `bun add` — say so in the findings so task 08 carries it).
- Do not fetch/execute untrusted install scripts beyond the standard Capacitor CLI.

## Verification
```sh
test -s docs/10-capacitor-ipad-analysis/findings/02-capacitor-feasibility.md
grep -q '^## Facts' docs/10-capacitor-ipad-analysis/findings/02-capacitor-feasibility.md
grep -c 'checked 2026' docs/10-capacitor-ipad-analysis/findings/02-capacitor-feasibility.md  # expect ≥8
git status --porcelain | grep -v 'docs/10-capacitor-ipad-analysis' | grep . && echo DIRTY || echo CLEAN
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules | grep . && echo LOCKFILE || echo OK
```
Manual: every question 1–8 has either a cited answer or an explicit NEEDS-MEASURE gap —
count them off.

## Definition of done
- [ ] All 8 question areas answered-or-gapped, none silently skipped
- [ ] Every Fact carries a dated citation; spike observations labeled as measured
- [ ] Exact version pins recommended for all Capacitor packages
- [ ] Lockfile check clean; repo tree clean outside this folder
- [ ] Storage comparison includes the "app-private, invisible to Files app" requirement
