#!/usr/bin/env bun
/* eslint-env node */
/* global URL, process, console */
/**
 * check-classes.mjs — CSS class-usage auditor.
 *
 * NOTE ON THE ESLint DIRECTIVES ABOVE: client/eslint.config.js scopes
 * `globals.node` to `files: ["*.{js,ts}"]`, which matches only the WORKSPACE
 * ROOT — not `scripts/**` and not `.mjs`. This CLI script would therefore be
 * linted as browser code and fail `no-undef` on URL/process/console. Declaring
 * the globals here keeps the fix inside this file; eslint.config.js belongs to
 * another task's `Touches` list (task 09 owns only .css, styles/, main.tsx and
 * scripts/). A follow-up should widen the config block to
 * `["*.{js,ts}", "scripts/**"]` instead.
 *
 * RUNTIME: bun only. `node` is not on PATH in this repo (CLAUDE.md).
 *   bun scripts/check-classes.mjs --dead
 *   bun scripts/check-classes.mjs --missing
 *   bun scripts/check-classes.mjs --collisions
 *
 * Modes
 *   --dead        classes declared in CSS but never referenced from source
 *   --missing     classes referenced from source but never declared in CSS
 *   --collisions  @keyframes names defined more than once (one global namespace)
 *
 * Exit code is non-zero when the selected mode finds anything, so CI catches a
 * newly orphaned class. `--baseline <n>` tolerates a known count (used while the
 * refresh is mid-flight).
 *
 * Source scanning deliberately handles:
 *   - className="a b"   className={'a b'}   className={`a b`}
 *   - RECURSION into ${...} expressions inside template literals, so
 *       `layer-item ${sel ? 'selected' : ''}`
 *     registers BOTH `layer-item` and `selected`.
 *   - classList.add/remove/toggle/contains(...)
 *   - raw class="..." appearing inside template strings (generated markup)
 *   - querySelector/querySelectorAll/closest/matches('.x')
 *   - bare string literals that exactly match a declared CSS class (catches
 *     names returned from a switch, e.g. Header.tsx's `status-saving`).
 *   - PREFIX interpolation: `arrow-${direction}` splits a class name across a
 *     literal stem and a runtime value, so the full name NEVER appears as a
 *     literal anywhere and no amount of ${} recursion can recover it. Any
 *     declared class beginning with such a stem is treated as live.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLIENT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(CLIENT_ROOT, 'src');

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'storybook-static']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const allFiles = walk(SRC);
const cssFiles = allFiles.filter((f) => extname(f) === '.css');
const srcFiles = allFiles.filter((f) => ['.ts', '.tsx', '.js', '.jsx'].includes(extname(f)));

/* ------------------------------------------------------------------ CSS side */

/** Strip comments and the bodies of rules so we only read selector text. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** name -> Set of "file:line" */
const declared = new Map();
/** keyframes name -> array of "file:line" */
const keyframes = new Map();

for (const file of cssFiles) {
  const rel = relative(CLIENT_ROOT, file);
  const raw = readFileSync(file, 'utf8');
  const text = stripComments(raw);

  // Track line numbers by scanning the stripped text with offsets mapped back
  // approximately via the raw text is overkill; recompute per-match on `text`.
  const lineAt = (idx) => text.slice(0, idx).split('\n').length;

  // Selectors: everything before a `{` that is not an at-rule body.
  const selectorRe = /(^|[};])\s*([^{}@;]+?)\s*\{/g;
  let m;
  while ((m = selectorRe.exec(text)) !== null) {
    const selector = m[2];
    const line = lineAt(m.index);
    for (const c of selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
      if (!declared.has(c[1])) declared.set(c[1], new Set());
      declared.get(c[1]).add(`${rel}:${line}`);
    }
  }

  for (const k of text.matchAll(/@keyframes\s+([\w-]+)/g)) {
    const name = k[1];
    if (!keyframes.has(name)) keyframes.set(name, []);
    keyframes.get(name).push(`${rel}:${lineAt(k.index)}`);
  }
}

/* --------------------------------------------------------------- source side */

/** name -> Set of "file:line" */
const used = new Map();
function markUsed(name, where) {
  if (!name) return;
  if (!used.has(name)) used.set(name, new Set());
  used.get(name).add(where);
}

/**
 * Class-name stems produced by prefix interpolation, e.g. `arrow-` from
 * `` `arrow-${direction}` ``. stem -> Set of "file:line".
 */
const prefixStems = new Map();
function markPrefix(stem, where) {
  // A bare `-` or a 1-char stem would match far too much; require something
  // that looks like a real name segment ending in a separator.
  if (!/^[_a-zA-Z][\w-]*-$/.test(stem)) return;
  if (!prefixStems.has(stem)) prefixStems.set(stem, new Set());
  prefixStems.get(stem).add(where);
}

/**
 * Harvest class names from a chunk of source that is *expected* to be class
 * text. Recurses into `${...}` so nested literals are also harvested.
 */
function harvestClassExpression(chunk, where) {
  // 1. Pull out every ${...} region (balanced-brace aware) and recurse on the
  //    string literals inside it, then blank the region out.
  let plain = '';
  for (let i = 0; i < chunk.length; i++) {
    if (chunk[i] === '$' && chunk[i + 1] === '{') {
      // If the text immediately before this ${ is a partial class name with no
      // intervening whitespace, this is a PREFIX interpolation: the resulting
      // class name is never a literal. Record the stem.
      const tail = plain.match(/(?:^|[\s'"`])([_a-zA-Z][\w-]*-)$/);
      if (tail) markPrefix(tail[1], where);

      let depth = 1;
      let j = i + 2;
      while (j < chunk.length && depth > 0) {
        if (chunk[j] === '{') depth++;
        else if (chunk[j] === '}') depth--;
        j++;
      }
      const inner = chunk.slice(i + 2, j - 1);
      // Every string literal inside the expression is a candidate class list.
      for (const lit of inner.matchAll(/'([^'\\]*)'|"([^"\\]*)"|`([^`\\$]*)`/g)) {
        harvestClassExpression(lit[1] ?? lit[2] ?? lit[3] ?? '', where);
      }
      // Nested template literals with their own ${} get caught by recursion on
      // the whole inner text too (cheap, and only adds names).
      for (const nested of inner.matchAll(/`([^`]*)`/g)) {
        if (nested[1].includes('${')) harvestClassExpression(nested[1], where);
      }
      i = j - 1;
      continue;
    }
    plain += chunk[i];
  }
  // 2. Whatever is left is literal class text.
  for (const name of plain.split(/[\s'"`]+/)) {
    if (/^-?[_a-zA-Z][\w-]*$/.test(name)) markUsed(name, where);
  }
}

/** Read the value expression that follows `className=` at index i. */
function readClassNameValue(text, i) {
  // i points just past `className=`
  while (i < text.length && /\s/.test(text[i])) i++;
  const ch = text[i];
  if (ch === '"' || ch === "'") {
    const end = text.indexOf(ch, i + 1);
    return end === -1 ? null : { value: text.slice(i + 1, end), end };
  }
  if (ch === '{') {
    let depth = 1;
    let j = i + 1;
    while (j < text.length && depth > 0) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') depth--;
      j++;
    }
    return { value: text.slice(i + 1, j - 1), end: j };
  }
  return null;
}

for (const file of srcFiles) {
  const rel = relative(CLIENT_ROOT, file);
  const text = readFileSync(file, 'utf8');
  const lineAt = (idx) => `${rel}:${text.slice(0, idx).split('\n').length}`;

  // className= / class= (JSX + generated markup)
  const attrRe = /\b(?:className|class)\s*=/g;
  let m;
  while ((m = attrRe.exec(text)) !== null) {
    const read = readClassNameValue(text, m.index + m[0].length);
    if (!read) continue;
    const where = lineAt(m.index);
    if (read.value.trim().startsWith('{') || read.value.includes('${') || /['"`]/.test(read.value)) {
      // JSX expression container or a literal with interpolation.
      // Harvest every string literal in it, recursing into ${}.
      let any = false;
      for (const lit of read.value.matchAll(/'([^'\\]*)'|"([^"\\]*)"|`((?:[^`\\]|\\.)*)`/g)) {
        any = true;
        harvestClassExpression(lit[1] ?? lit[2] ?? lit[3] ?? '', where);
      }
      if (!any) harvestClassExpression(read.value, where);
    } else {
      harvestClassExpression(read.value, where);
    }
    attrRe.lastIndex = read.end;
  }

  // classList.add/remove/toggle/contains/replace(...)
  for (const c of text.matchAll(
    /classList\s*\.\s*(?:add|remove|toggle|contains|replace)\s*\(([^)]*)\)/g,
  )) {
    harvestClassExpression(c[1], lineAt(c.index));
  }

  // querySelector / querySelectorAll / closest / matches('.x')
  for (const q of text.matchAll(
    /(?:querySelectorAll|querySelector|closest|matches)\s*\(\s*(['"`])([^'"`]*)\1/g,
  )) {
    for (const sel of q[2].matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
      markUsed(sel[1], lineAt(q.index));
    }
  }

  // Bare string literals that exactly match a declared class name. Catches
  // helper functions that RETURN a class name (Header.tsx's saveStatus switch).
  for (const lit of text.matchAll(/(['"])([-\w ]+)\1/g)) {
    for (const part of lit[2].split(/\s+/)) {
      if (declared.has(part)) markUsed(part, lineAt(lit.index));
    }
  }
}

/* ------------------------------------------------------------------- reports */

const args = process.argv.slice(2);
const baselineIdx = args.indexOf('--baseline');
const baseline = baselineIdx === -1 ? 0 : Number(args[baselineIdx + 1] ?? 0);
const modes = args.filter((a) => a.startsWith('--') && a !== '--baseline');
const verbose = modes.includes('--verbose');

const stems = [...prefixStems.keys()];
/** A class built by prefix interpolation is live even though it is never a literal. */
const builtByPrefix = (c) => stems.some((s) => c.startsWith(s) && c.length > s.length);

const dead = [...declared.keys()].filter((c) => !used.has(c) && !builtByPrefix(c)).sort();
// A stem itself (`arrow-`) is the literal half of a prefix interpolation, not a
// real class reference, so it is never "missing".
const missing = [...used.keys()].filter((c) => !declared.has(c) && !prefixStems.has(c)).sort();
const collisions = [...keyframes.entries()].filter(([, v]) => v.length > 1);

let failures = 0;

function report(title, rows) {
  console.log(`\n${title} (${rows.length})`);
  console.log('-'.repeat(title.length + 8));
  for (const r of rows) console.log(r);
}

if (modes.includes('--dead') || modes.length === 0 || (modes.length === 1 && verbose)) {
  report(
    'DEAD CSS CLASSES — declared but never referenced',
    dead.map((c) => `  .${c}  ${[...declared.get(c)].slice(0, 3).join(', ')}`),
  );
  if (dead.length > baseline) failures++;
}

if (modes.includes('--missing') || modes.length === 0 || (modes.length === 1 && verbose)) {
  report(
    'MISSING CSS — referenced in source but never declared',
    missing.map((c) => `  .${c}  ${[...used.get(c)].slice(0, 3).join(', ')}`),
  );
  if (modes.includes('--missing') && missing.length > baseline) failures++;
}

if (modes.includes('--collisions') || modes.length === 0) {
  report(
    '@keyframes COLLISIONS — one global namespace, last definition wins',
    collisions.map(([name, sites]) => `  @keyframes ${name}  ×${sites.length}  ${sites.join(', ')}`),
  );
  if (collisions.length > 0) failures++;
}

console.log(
  `\nsummary: ${declared.size} declared, ${used.size} referenced, ` +
    `${dead.length} dead, ${missing.length} missing, ${collisions.length} keyframe collisions`,
);

process.exit(failures > 0 ? 1 : 0);
