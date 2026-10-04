#!/usr/bin/env bash
# Read-only app/DB/image preflight. No player rows or service credentials are copied.
set -euo pipefail
command -v timeout >/dev/null || { echo 'timeout is required for bounded pre-switch checks' >&2; exit 1; }
# Bound the client as well as the SQL server; no call can wait indefinitely.
run_docker() { timeout --foreground --kill-after=5s 30s docker "$@"; }
if [ "$#" -ne 11 ]; then echo 'Expected exact candidate/prior release identities' >&2; exit 1; fi
candidate_image="$1"; candidate_build="$2"; previous_image="$3"; previous_build="$4"
app_port="$5"; db_user="$6"; db_name="$7"; repository="$8"
approved_record_sha="$9"; approved_record_file="${10}"; verified_receipt_file="${11}"
[[ "$approved_record_sha" =~ ^[a-f0-9]{64}$ ]] || exit 1
[ -f "$approved_record_file" ] && [ -f "$verified_receipt_file" ] || exit 1
case "$candidate_image" in "ghcr.io/${repository}@sha256:"*) ;; *) echo 'Candidate must use the pinned repository digest' >&2; exit 1;; esac
[[ "$candidate_build" =~ ^[a-f0-9]{40}$ && "$previous_build" =~ ^[a-f0-9]{40}$ && "$previous_image" =~ ^sha256:[a-f0-9]{64}$ && "$app_port" =~ ^[0-9]+$ ]] || exit 1
scratch="$(mktemp -d "${TMPDIR:-/tmp}/yard-release-preflight.XXXXXX")"
trap 'rm -rf -- "$scratch"' EXIT
chmod 0700 "$scratch"
# The trusted release invocation supplies approval and authoritative receipt.
# Never obtain the expected approval hash from the candidate image itself.
printf '%s\n' "$approved_record_sha" > "$scratch/maintenance-approved-sha256.txt"
cp -- "$approved_record_file" "$scratch/maintenance-record.json"
cp -- "$verified_receipt_file" "$scratch/maintenance-predecessor-receipt.json"
printf '%s\n' "$repository" > "$scratch/repository.txt"
printf '%s\n' "${candidate_image##*@}" > "$scratch/candidate-digest.txt"
printf '%s\n' "$candidate_build" > "$scratch/candidate-build.txt"
printf '%s\n' "$previous_image" > "$scratch/previous-image-id.txt"
printf '%s\n' "$previous_build" > "$scratch/previous-build.txt"
run_docker image inspect "$candidate_image" --format '{{json .}}' > "$scratch/candidate-image.json"
run_docker image inspect "$previous_image" --format '{{json .}}' > "$scratch/previous-image.json"
run_docker run --rm --network none -e "APP_BUILD_ID=$candidate_build" "$candidate_image" node scripts/yard-release-compatibility.mjs > "$scratch/candidate.json"
# Probe the pristine immutable rollback image without mounts, network, DB or secrets.
# Exit42 is exclusively the shell's explicit absent-command sentinel. Any other
# Docker/permission/probe failure blocks instead of being mistaken for legacy.
if run_docker run --rm --network none -e "APP_BUILD_ID=$previous_build" "$previous_image" sh -c \
  'if [ ! -f /app/scripts/yard-release-compatibility.mjs ]; then exit 42; fi; exec node /app/scripts/yard-release-compatibility.mjs' > "$scratch/previous.json"; then
  :
else
  probe_status="$?"
  if [ "$probe_status" -ne 42 ]; then echo 'Previous image compatibility probe failed' >&2; exit "$probe_status"; fi
  printf 'null\n' > "$scratch/previous.json"
fi
curl --connect-timeout 5 --max-time 10 -fsS "http://127.0.0.1:${app_port}/api/health" > "$scratch/previous-health.json"
run_docker exec -e "PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=10000 -c lock_timeout=3000" ccgh-postgres psql -X -A -t -v ON_ERROR_STOP=1 -U "$db_user" -d "$db_name" \
  -c "SELECT count(*) FROM players WHERE data ? '_yardV2';" > "$scratch/persistent-yard-count.txt"
# The pinned candidate supplies the verifier; no host Node installation is needed.
run_docker run --rm --network none --mount "type=bind,src=$scratch,dst=/yard-preflight,readonly" "$candidate_image" \
  node scripts/verify-yard-rollback-target.mjs /yard-preflight > "$scratch/provisional-result.json"
# Re-observe immediately before returning to the locked deployment. This is a
# bounded recheck, not an atomic database fence against unknown external writers.
[ "$(run_docker inspect --format '{{.Image}}' ccgh-app)" = "$previous_image" ]
run_docker exec -e "PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=10000 -c lock_timeout=3000" ccgh-postgres psql -X -A -t -v ON_ERROR_STOP=1 -U "$db_user" -d "$db_name" \
  -c "SELECT count(*) FROM players WHERE data ? '_yardV2';" > "$scratch/persistent-yard-count.txt"
[ "$(run_docker inspect --format '{{.Image}}' ccgh-app)" = "$previous_image" ]
run_docker run --rm --network none --mount "type=bind,src=$scratch,dst=/yard-preflight,readonly" "$candidate_image" \
  node scripts/verify-yard-rollback-target.mjs /yard-preflight
