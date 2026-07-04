#!/usr/bin/env bash
# The whole headless check suite in one go: syntax-checks every js/ module,
# then runs every tests/check-*.mjs (new suites are picked up automatically —
# just drop a check-<name>.mjs in tests/).
#
# The sims roll real Math.random, so a suite can fail on a rare draw: a first
# failure is retried (up to $MAX attempts total) and a pass-on-retry is
# reported as FLAKY, not FAIL — loud but non-blocking. A FLAKY line recurring
# on the same suite means a real intermittent bug; chase it, don't ignore it.
# Exit code 0 = nothing hard-failed.
cd "$(dirname "$0")/.." || exit 1

MAX=3
fail=0

for f in js/*.js; do
  if ! node --check "$f" 2>/dev/null; then
    echo "SYNTAX FAIL  $f"
    node --check "$f" 2>&1 | head -5
    fail=1
  fi
done
[ "$fail" -eq 0 ] && echo "syntax ok     js/*.js"

for t in tests/check-*.mjs; do
  attempt=0 passed=""
  while [ "$attempt" -lt "$MAX" ]; do
    attempt=$((attempt + 1))
    if out=$(node "$t" 2>&1); then passed=1; break; fi
  done
  if [ -z "$passed" ]; then
    echo "FAIL          $t (all $MAX attempts)"
    echo "$out" | grep -E "FAIL|Error" | head -10
    fail=1
  elif [ "$attempt" -gt 1 ]; then
    echo "FLAKY         $t (passed on attempt $attempt/$MAX — rerun to reproduce the failing draw)"
  else
    echo "PASS          $t"
  fi
done

exit "$fail"
