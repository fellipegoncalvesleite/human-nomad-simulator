#!/usr/bin/env bash
# CORRECTION-7 — expedition-vs-trips attribution matrix.
# Re-runs the measurement lost when a session scratchpad was cleared. Each arm swaps
# ONE production file to its corr-3 (0b119f2) content, runs the 100y habitat audit, and
# restores. Outputs and metadata go to docs/evidence/correction7/ (in-repo, durable).
set -uo pipefail
cd "$(dirname "$0")/.."

OUT=docs/evidence/correction7
mkdir -p "$OUT"
BASE=0b119f2   # corr-3: verification knowledge fixed, no requireMultiDay, no value gate
HEAD_SHA=$(git rev-parse --short HEAD)

EXP=src/sim/agents/expedition.ts
TRIPS=src/sim/agents/intraSeasonTrips.ts

cp "$EXP" /tmp/_exp_head.ts
cp "$TRIPS" /tmp/_trips_head.ts
restore() { cp /tmp/_exp_head.ts "$EXP"; cp /tmp/_trips_head.ts "$TRIPS"; }
trap restore EXIT

run_arm() {
  local name="$1" desc="$2"
  local log="$OUT/arm_${name}.json"
  local meta="$OUT/arm_${name}.meta.txt"
  local start; start=$(date -Is)
  node scripts/expeditionHabitatCasesAudit.mjs --years 100 > "$log" 2>"$OUT/arm_${name}.stderr"
  local code=$?
  {
    echo "arm:        $name"
    echo "descr:      $desc"
    echo "command:    node scripts/expeditionHabitatCasesAudit.mjs --years 100"
    echo "head:       $HEAD_SHA"
    echo "base_ref:   $BASE"
    echo "scenario:   map2 isolated 22-person founder, physically scored rich/ordinary/marginal"
    echo "seed:       runSeed per-case string (habitat-<case>); no jitter"
    echo "years:      100"
    echo "started:    $start"
    echo "finished:   $(date -Is)"
    echo "exit_code:  $code"
    echo "output:     $log"
    echo "expedition.ts: $(git hash-object "$EXP")"
    echo "intraSeasonTrips.ts: $(git hash-object "$TRIPS")"
  } > "$meta"
  echo "[$name] exit=$code -> $log"
}

# Arm 1: HEAD — both corrections active (value gate + requireMultiDay/inspectionOnly)
restore
run_arm both_new "HEAD: value gate ON, requireMultiDay ON"

# Arm 2: expedition.ts reverted -> isolates the VALUE GATE's contribution
restore
git show "$BASE:$EXP" > "$EXP"
run_arm exp_old "expedition.ts@corr-3 (no value gate), trips@HEAD"

# Arm 3: intraSeasonTrips.ts reverted -> isolates requireMultiDay/inspectionOnly
restore
git show "$BASE:$TRIPS" > "$TRIPS"
run_arm trips_old "intraSeasonTrips.ts@corr-3, expedition.ts@HEAD"

# Arm 4: both reverted -> corr-3 reference baseline
git show "$BASE:$EXP" > "$EXP"
git show "$BASE:$TRIPS" > "$TRIPS"
run_arm both_old "both files @corr-3 (reference baseline)"

restore
echo "ALL ARMS DONE"
