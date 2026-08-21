#!/usr/bin/env bun
/**
 * check-boundaries.mjs — REFRESH task 38, step 7.
 *
 * A SECOND, cheaper gate for the architectural boundaries ESLint already
 * enforces. It exists because a full lint pass is slow and because a readable
 * report beats a stack of `no-restricted-imports` messages when a boundary
 * genuinely breaks.
 *
 * ⚠️ It does NOT replace ESLint. ESLint is the authority; if the two ever
 * disagree, ESLint is right and this script has a bug. Its value is speed and
 * legibility, which is why it is a plain source scan rather than a parse.
 *
 * The five rules (from the task spec):
 *   1. nothing under `src/ui/` imports `stores/`, `store/`, `api/`,
 *      `services/`, `mobx`, `mobx-react-lite`, or calls `useContext`
 *   2. nothing under `src/ui/primitives/` imports a domain type
 *   3. `observer` is imported only under `src/containers/`
 *   4. nothing under `src/stores/domain/` imports from `src/stores/ui/`
 *   5. nothing under `src/api/` imports from `stores/` or `components/`
 *
 * Test files are exempt: a test may reach across any boundary to set one up.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname;

/** Every .ts/.tsx under `dir`, excluding test files and stories. */
function sources(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "__tests__" || entry === "node_modules") continue;
        walk(full);
      } else if (/\.tsx?$/.test(entry) && !/\.(test|stories)\.tsx?$/.test(entry)) {
        out.push(full);
      }
    }
  };
  try {
    walk(dir);
  } catch {
    /* a tier that does not exist yet is not a violation */
  }
  return out;
}

/** The module specifiers a file imports (static + dynamic + re-export). */
function imports(text) {
  const specs = [];
  const re = /(?:import|export)[\s\S]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    specs.push(m[1] ?? m[2] ?? m[3]);
  }
  return specs;
}

const violations = [];
const record = (rule, file, detail) =>
  violations.push({ rule, file: relative(SRC, file).split(sep).join("/"), detail });

/* ── Rule 1: ui/ purity ──────────────────────────────────────────────────── */
const UI_FORBIDDEN = [
  // ⚠️ The trailing `(\/|$)` matters: a relative `../store` has NO trailing
  // slash, and the first draft of this script MISSED exactly that import in
  // its own negative control. A boundary script that cannot fail is worth
  // nothing, which is why every rule here is probed with a deliberate
  // violation before it is trusted.
  [/(^|\/)stores?(\/|$)/, "stores/ or store/"],
  [/(^|\/)api(\/|$)/, "api/"],
  [/(^|\/)services(\/|$)/, "services/"],
  [/^mobx$/, "mobx"],
  [/^mobx-react-lite$/, "mobx-react-lite"],
];
for (const file of sources(join(SRC, "ui"))) {
  const text = readFileSync(file, "utf8");
  for (const spec of imports(text)) {
    for (const [pattern, label] of UI_FORBIDDEN) {
      if (pattern.test(spec)) record("ui-purity", file, `imports ${label} ("${spec}")`);
    }
  }
  if (/\buseContext\s*\(/.test(text)) {
    record("ui-purity", file, "calls useContext()");
  }
}

/* ── Rule 2: ui/primitives/ takes no domain type ─────────────────────────── */
for (const file of sources(join(SRC, "ui", "primitives"))) {
  for (const spec of imports(readFileSync(file, "utf8"))) {
    if (/(^|\/)types(\/|$)/.test(spec)) {
      record("primitives-no-domain-type", file, `imports a domain type ("${spec}")`);
    }
  }
}

/* ── Rule 3: observer() only under containers/ ───────────────────────────── */
for (const file of sources(SRC)) {
  const rel = relative(SRC, file).split(sep).join("/");
  if (rel.startsWith("containers/")) continue;
  const text = readFileSync(file, "utf8");
  if (imports(text).some((s) => s === "mobx-react-lite") && /\bobserver\b/.test(text)) {
    record("observer-only-in-containers", file, "imports observer() outside containers/");
  }
}

/* ── Rule 4: stores/domain/ must not import stores/ui/ ───────────────────── */
for (const file of sources(join(SRC, "stores", "domain"))) {
  for (const spec of imports(readFileSync(file, "utf8"))) {
    if (/(^|\/)ui\//.test(spec) && !/\/ui\/(components|primitives)\//.test(spec)) {
      record("domain-not-import-ui", file, `imports stores/ui ("${spec}")`);
    }
  }
}

/* ── Rule 5: api/ must not import stores/ or components/ ─────────────────── */
for (const file of sources(join(SRC, "api"))) {
  for (const spec of imports(readFileSync(file, "utf8"))) {
    if (/(^|\/)stores?(\/|$)/.test(spec) || /(^|\/)components(\/|$)/.test(spec)) {
      record("api-not-import-stores", file, `imports ${spec}`);
    }
  }
}

/* ── Report ──────────────────────────────────────────────────────────────── */
if (violations.length === 0) {
  console.log("check-boundaries: OK — all 5 boundary rules hold.");
  process.exit(0);
}
console.error(`check-boundaries: ${violations.length} violation(s)\n`);
for (const { rule, file, detail } of violations) {
  console.error(`  [${rule}] src/${file}\n      ${detail}`);
}
process.exit(1);
