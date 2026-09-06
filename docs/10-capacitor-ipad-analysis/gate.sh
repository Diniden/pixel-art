#!/bin/sh
# gate.sh <w1|w2|w3|w4> — wave gates for docs/10-capacitor-ipad-analysis.
# Assembled by the coordinator from MASTER.md §5/§10. Docs-only plan: the gate
# proves artifacts exist AND that nothing changed outside docs/ (+.claude/).
cd "$(git rev-parse --show-toplevel)" || exit 1
P=docs/10-capacitor-ipad-analysis
status=0
err() { echo "GATE FAIL: $*"; status=1; }

# Every wave: working tree clean outside docs/ and .claude/; no lockfiles.
if git status --porcelain | grep -vE '^(\?\?|.M) (docs/|\.claude/)' | grep -q .; then
  git status --porcelain | grep -vE '^(\?\?|.M) (docs/|\.claude/)'
  err "working tree dirty outside docs/ and .claude/"
fi
if find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules | grep -q .; then
  err "lockfile detected"
fi

case "$1" in
w1)
  for n in 01 02 03 04 05 06; do
    f=$(ls "$P"/findings/$n-*.md 2>/dev/null | head -1)
    if [ -z "$f" ] || [ ! -s "$f" ]; then err "findings $n missing or empty"; continue; fi
    for sec in '^## Facts' '^## Options' '^## Recommendation' '^## Gaps'; do
      grep -q "$sec" "$f" || err "$f missing section matching '$sec'"
    done
  done
  ;;
w2)
  [ -s "$P/GAPS.md" ] || err "GAPS.md missing/empty"
  [ -s "$P/DECISIONS-NEEDED.md" ] || err "DECISIONS-NEEDED.md missing/empty"
  [ -s "$P/findings/00-synthesis.md" ] || err "findings/00-synthesis.md missing/empty"
  grep -nE 'TBD|TODO' "$P/GAPS.md" && err "GAPS.md contains TBD/TODO markers"
  for id in $(grep -hoE '^### G-[1-6][0-9]{2}' "$P"/findings/0[1-6]-*.md 2>/dev/null | grep -oE 'G-[0-9]+' | sort -u); do
    grep -q "$id" "$P/GAPS.md" || err "findings gap $id not accounted for in GAPS.md"
  done
  ;;
w3)
  for f in MASTER.md HANDOFF.md GAPS.md; do
    [ -s "docs/11-capacitor-ipad-port/$f" ] || err "docs/11-capacitor-ipad-port/$f missing/empty"
  done
  n=$(ls docs/11-capacitor-ipad-port/[0-9][0-9]-*.md 2>/dev/null | wc -l | tr -d ' ')
  [ "$n" -ge 8 ] || err "docs/11 has only $n task files (need >= 8)"
  ;;
w4)
  [ -s "$P/REVIEW.md" ] || err "REVIEW.md missing/empty"
  grep -q 'Verdict' "$P/REVIEW.md" || err "REVIEW.md missing Verdict"
  if grep -q '| OPEN |' "$P/REVIEW.md"; then err "REVIEW.md has OPEN findings"; fi
  ;;
*)
  echo "usage: gate.sh w1|w2|w3|w4"; exit 2
  ;;
esac

[ "$status" -eq 0 ] && echo "GATE $1 PASS"
exit "$status"
