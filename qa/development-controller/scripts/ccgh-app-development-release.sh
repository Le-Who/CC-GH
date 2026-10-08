#!/usr/bin/env bash
# Reviewed development protocol evolution. Only the app is replaced or rolled back.
# No host install, environment dump, database restore, orphan cleanup, or host restart.
set -euo pipefail
umask 077
if [ "$#" -ne 5 ]; then
  echo 'Usage: ccgh-app-development-release.sh PACKET APPROVED_RECORD_SHA256 EXISTING_RELEASE_ROOT VERIFIED_PRIOR_IMAGE_ID VERIFIED_PRIOR_DIGEST' >&2
  exit 2
fi
packet="$1"; approved="$2"; release_root="$3"; verifier_image="$4"; prior_digest="$5"
[ -n "${YARD_TRANSPORT_ENV_IDENTITY:-}" ] || { echo 'Captured transport environment identity is required' >&2; exit 2; }
[[ "$approved" =~ ^[a-f0-9]{64}$ && "$verifier_image" =~ ^sha256:[a-f0-9]{64}$ && "$prior_digest" =~ ^sha256:[a-f0-9]{64}$ ]] || exit 2
readonly authorized_release_root=/opt/game-hub
[ "$release_root" = "$authorized_release_root" ] || { echo 'Only the existing /opt/game-hub release root is authorized' >&2; exit 2; }
for tool in docker curl timeout flock mktemp sha256sum systemctl cat mkdir chmod stat env sleep dirname rm; do
  command -v "$tool" >/dev/null || { echo "Existing tool is required: $tool" >&2; exit 1; }
done
# Every read and replacement must address the same local daemon. Ambient remote
# context options must not make preflight inspect one host and Compose another.
for option in DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH DOCKER_CONFIG; do
  [ -z "${!option:-}" ] || { echo "Unexpected Docker endpoint override: $option" >&2; exit 1; }
done
# Refuse ambiguous mount/compose paths. Never create or provision a release root.
[[ "$packet" = /* && "$release_root" = /* && "$packet" != *[:,]* && "$release_root" != *[:,]* ]] || exit 2
test -d "$release_root"; test ! -L "$release_root"
[ "$(cd -- "$release_root" && pwd -P)" = "$authorized_release_root" ]
test -d "$release_root/backups"; test ! -L "$release_root/backups"
[ "$(cd -- "$release_root/backups" && pwd -P)" = "$authorized_release_root/backups" ]
[[ "$packet" = "$authorized_release_root"/releases/* ]]
test -d "$packet"; test ! -L "$packet"
[ "$(cd -- "$packet" && pwd -P)" = "$packet" ]
regular_single_link() {
  test -f "$1" && test ! -L "$1" && [ "$(stat -Lc '%h' -- "$1")" = 1 ]
}
for file in development-record.json predecessor-receipt.json candidate-receipt.json; do
  regular_single_link "$packet/$file"
done
for file in docker-compose.yml .env .release.lock; do regular_single_link "$release_root/$file"; done
[[ "${BASH_SOURCE[0]}" = "$authorized_release_root"/* ]]
regular_single_link "${BASH_SOURCE[0]}"
tools_dir="$(dirname -- "${BASH_SOURCE[0]}")"
[ "$(cd -- "$tools_dir" && pwd -P)" = "$tools_dir" ]
regular_single_link "$tools_dir/yard-development-contract.mjs"
cd -- "$release_root"
lock_identity="$(stat -Lc '%d:%i:%h:%F' -- .release.lock)"
# Read-only open: never truncate a lock or create a target if its path is swapped.
# Check the opened inode against the validated path before taking its lock.
exec 9< .release.lock
[ "$(stat -Lc '%d:%i:%h:%F' -- /proc/self/fd/9)" = "$lock_identity" ]
regular_single_link .release.lock
[ "$(stat -Lc '%d:%i:%h:%F' -- .release.lock)" = "$lock_identity" ]
flock -n 9 || { echo 'Another release owns the deployment lock' >&2; exit 1; }
regular_single_link .release.lock
[ "$(stat -Lc '%d:%i:%h:%F' -- .release.lock)" = "$lock_identity" ]
marker="$release_root/.yard-development-inflight"
if [ -e "$marker" ] || [ -L "$marker" ]; then
  echo 'A previous development replacement remains unresolved. Reconcile the host before another invocation.' >&2
  exit 70
fi
run_docker() { timeout --foreground --kill-after=5s 120s docker "$@"; }
[ "$(run_docker context show)" = default ]
[ "$(run_docker context inspect default --format '{{.Endpoints.docker.Host}}')" = unix:///var/run/docker.sock ]
run_docker compose version >/dev/null
readonly expected_prior_sha=ec815065f6adb7c36d81f97b41d47ad16e614b07
# Bootstrap Node from the independently verified immutable predecessor, never an
# unverified candidate or mutable tag. These inspect fields cannot contain secrets.
[ "$(run_docker inspect --format '{{.Image}}' ccgh-app)" = "$verifier_image" ]
[ "$(run_docker image inspect "$verifier_image" --format '{{.Id}}')" = "$verifier_image" ]
[ "$(run_docker image inspect "$verifier_image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$expected_prior_sha" ]
prior_repos="$(run_docker image inspect "$verifier_image" --format '{{range .RepoDigests}}{{println .}}{{end}}')"
[[ $'\n'"$prior_repos"$'\n' == *$'\n'"ghcr.io/le-who/cc-gh@$prior_digest"$'\n'* ]]
work="$(mktemp -d "$release_root/development-release.XXXXXX")"
chmod 0700 "$work"
exec 8>&2
exec 2>> "$work/operations.stderr.log"
early_exit() {
  local status="$?"; trap - EXIT
  if [ "$status" -ne 0 ]; then echo "Development release blocked before replacement. Private evidence: $work" >&8; fi
  exit "$status"
}
trap early_exit EXIT
compose="$release_root/docker-compose.yml"
env_identity="$(stat -Lc '%d:%i:%s:%y:%z' -- "$release_root/.env")"
[ "$env_identity" = "$YARD_TRANSPORT_ENV_IDENTITY" ] || { echo 'Environment identity changed after transport proof; replacement blocked' >&2; exit 1; }
check_settings() {
  test ! -L "$release_root" && [ "$(cd -- "$release_root" && pwd -P)" = "$authorized_release_root" ] || return 1
  for file in docker-compose.yml .env .release.lock; do regular_single_link "$release_root/$file" || return; done
  [ "$(stat -Lc '%d:%i:%h:%F' -- "$release_root/.release.lock")" = "$lock_identity" ] || return 1
  [ "$(stat -Lc '%d:%i:%s:%y:%z' -- "$release_root/.env")" = "$env_identity" ] || { echo 'Live environment file changed; replacement blocked' >&2; return 1; }
  verify check-compose "$record" /live-compose.yml
}
verify() {
  run_docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
    --entrypoint node -e NODE_OPTIONS= -e NODE_ENV=production \
    --mount "type=bind,src=$tools_dir/yard-development-contract.mjs,dst=/tools/yard-development-contract.mjs,readonly" \
    --mount "type=bind,src=$packet/development-record.json,dst=/packet/development-record.json,readonly" \
    --mount "type=bind,src=$packet/predecessor-receipt.json,dst=/packet/predecessor-receipt.json,readonly" \
    --mount "type=bind,src=$packet/candidate-receipt.json,dst=/packet/candidate-receipt.json,readonly" \
    --mount "type=bind,src=$compose,dst=/live-compose.yml,readonly" \
    --mount "type=bind,src=$work,dst=/work" \
    "$verifier_image" /tools/yard-development-contract.mjs "$@"
}
verify prepare /packet "$approved" /live-compose.yml /work
record=/work/verified-record.json
get() { verify get "$record" "$1"; }
candidate_sha="$(get candidate.commit)"
candidate_digest="$(get candidate.imageDigest)"
candidate_image="$(get candidate.imageId)"
[ "$(get predecessor.imageId)" = "$verifier_image" ]
[ "$(get predecessor.imageDigest)" = "$prior_digest" ]
local_url="$(get runtime.localUrl)"; public_url="$(get runtime.publicUrl)"
db_user="$(get runtime.dbUser)"; db_name="$(get runtime.dbName)"
image_format='{"id":{{json .Id}},"repoDigests":{{json .RepoDigests}},"revision":{{json (index .Config.Labels "org.opencontainers.image.revision")}},"command":{{json .Config.Cmd}}}'
app_format='{"image":{{json .Image}},"name":{{json .Name}},"project":{{json (index .Config.Labels "com.docker.compose.project")}},"service":{{json (index .Config.Labels "com.docker.compose.service")}},"running":{{json .State.Running}},"status":{{json .State.Status}},"boundary":{"ports":{{json .HostConfig.PortBindings}},"mounts":{{json .Mounts}},"networkNames":"{{range $name,$network := .NetworkSettings.Networks}}{{$name}};{{end}}","networkMode":{{json .HostConfig.NetworkMode}},"restartPolicy":{{json .HostConfig.RestartPolicy}}}}'
container_format='{"id":{{json .Id}},"image":{{json .Image}},"name":{{json .Name}},"startedAt":{{json .State.StartedAt}},"restartCount":{{json .RestartCount}},"status":{{json .State.Status}},"health":{{if eq (json (index .State "Health")) "null"}}null{{else}}{{json .State.Health.Status}}{{end}}}'
# Reconstruct the exact prior digest override used by the accepted activation.
# Bare compose/.env remain unchanged; never accept their older effective hash.
config_selector=predecessor
compose_for() {
  local which="$1" files="$compose"; shift
  [ "$which" = live ] || files="$compose:$work/$which.json"
  # Only this known, non-secret repository interpolation differs from .env.
  # The existing release path supplies GHCR_REPO as an export rather than a file.
  env -i PATH="$PATH" HOME="$HOME" GHCR_REPO=le-who/cc-gh COMPOSE_FILE="$files" COMPOSE_PROJECT_NAME=ccgh \
    timeout --foreground --kill-after=5s 120s docker compose -p ccgh "$@"
}
check_config_hash() {
  local expected actual
  expected="$(compose_for "$config_selector" config --hash app)" || return
  [[ "$expected" =~ ^app\ ([a-f0-9]{64})$ ]] || { echo 'Compose service hash unavailable' >&2; return 1; }
  expected="${BASH_REMATCH[1]}"
  actual="$(run_docker inspect --format '{{index .Config.Labels "com.docker.compose.config-hash"}}' ccgh-app)" || return
  [ "$actual" = "$expected" ] || { echo 'Effective app settings differ from running Compose configuration' >&2; return 1; }
}
run_docker image inspect "ghcr.io/le-who/cc-gh@$prior_digest" --format "$image_format" > "$work/predecessor-image.json"
verify image "$record" predecessor /work/predecessor-image.json
# The exact candidate must already be present from the trusted acceptance handoff.
# No registry login, pull, build, or publication is performed by this switch helper.
run_docker image inspect "ghcr.io/le-who/cc-gh@$candidate_digest" --format "$image_format" > "$work/candidate-image.json"
verify image "$record" candidate /work/candidate-image.json
check_app() {
  local which="$1"
  run_docker inspect --format "$app_format" ccgh-app > "$work/app.json" || return
  verify app "$record" "$which" /work/app.json || return
  if [ -f "$work/app-baseline.json" ]; then
    verify app-boundary /work/app-baseline.json /work/app.json || return
  fi
  check_config_hash
}
check_health() {
  local which="$1" origin="$2" suffix="$3"
  check_app "$which" || return
  curl --disable --noproxy '*' --connect-timeout 5 --max-time 10 -fsS "${origin}api/health" > "$work/health-$suffix.json" || return
  verify health "$record" "$which" "/work/health-$suffix.json" || return
  curl --disable --noproxy '*' --connect-timeout 5 --max-time 10 -fsS "${origin}api/config" > "$work/config-$suffix.json" || return
  verify config "$record" "$which" "/work/config-$suffix.json" || return
  curl --disable --noproxy '*' --connect-timeout 5 --max-time 10 -fsS "$origin" > "$work/html-$suffix.txt" || return
  verify html "$record" "$which" "/work/html-$suffix.txt" || return
  check_app "$which"
}
healthy_pair() {
  local which="$1"
  check_health "$which" "$local_url" local || return
  check_health "$which" "$public_url" public
}
snapshot() {
  local label="$1" id name service
  mkdir "$work/$label" || return
  cat /proc/sys/kernel/random/boot_id > "$work/$label/boot-id" || return
  : > "$work/$label/containers.ndjson"; : > "$work/$label/services.txt"
  run_docker ps -aq --no-trunc > "$work/$label/container-ids" || return
  while IFS= read -r id; do
    [[ "$id" =~ ^[a-f0-9]{64}$ ]] || return 1
    name="$(run_docker inspect --format '{{.Name}}' "$id")" || return
    [ "$name" = /ccgh-app ] && continue
    run_docker inspect --format "$container_format" "$id" >> "$work/$label/containers.ndjson" || return
  done < "$work/$label/container-ids"
  verify services "$record" > "$work/$label/service-names" || return
  while IFS= read -r service; do
    printf '\n@@SERVICE@@\n%s\n' "$service" >> "$work/$label/services.txt"
    timeout --foreground --kill-after=5s 15s systemctl show "$service" \
      --property=Id,LoadState,ActiveState,SubState,MainPID,ExecMainStartTimestampMonotonic >> "$work/$label/services.txt" || return
  done < "$work/$label/service-names"
  verify snapshot "/work/$label" > "$work/$label.json"
}
switch_started=0
compose_outcome_uncertain=0
compose_in_flight=0
create_marker() {
  printf -v marker_contents 'format=cc-gh-yard-development-inflight/v1\ncandidate=%s\ndigest=%s\npredecessor=%s\nrecord=%s\nevidence=%s\n' \
    "$candidate_sha" "$candidate_digest" "$expected_prior_sha" "$approved" "$work"
  # Exclusive creation refuses existing files and symlinks. A crash during the
  # write still leaves a marker that blocks the next helper invocation.
  (set -o noclobber; printf '%s' "$marker_contents" > "$marker") || return
  regular_single_link "$marker" || return
  marker_identity="$(stat -Lc '%d:%i:%h:%s:%F' -- "$marker")" || return
  printf '%s' "$marker_contents" > "$work/inflight-marker.txt"
}
clear_marker() {
  regular_single_link "$marker" || return
  [ "$(stat -Lc '%d:%i:%h:%s:%F' -- "$marker")" = "$marker_identity" ] || return 1
  [ "$(cat -- "$marker")" = "${marker_contents%$'\n'}" ] || return 1
  # Only this invocation's exact marker is removed, under the shared lock,
  # after the selected image and protected-boundary health has been verified.
  rm -- "$marker"
}
compose_switch() {
  local which="$1" status
  # Compose reads the existing .env itself; caller environment variables cannot
  # silently override its ports, credentials, volumes, or service settings.
  config_selector="$which"
  compose_in_flight=1
  if compose_for "$which" up -d --no-deps --pull never --no-build app; then compose_in_flight=0; return 0; else status="$?"; fi
  compose_in_flight=0
  # Killing the CLI does not establish that the daemon cancelled its operation.
  # Do not race it with a second replacement or claim a verified recovery.
  case "$status" in 124|130|137|143) compose_outcome_uncertain=1;; esac
  return "$status"
}
rollback() {
  echo 'Rolling back app only to the qualified current predecessor; preserve version-2 Yard state.' >&2
  check_settings || return
  compose_switch predecessor || return
  # Running is insufficient: verify image, build, DB/Redis health, config and HTML
  # at both loopback and public origin after the rollback actually completed.
  wait_healthy predecessor || return
  snapshot after-rollback || return
  verify protected /work/before.json /work/after-rollback.json || return
  printf '%s\n' 'rollback-healthy; prior-image-v2-compatible-replay-qualified; neighbor-application-health-not-proven' > "$work/result.txt"
  clear_marker || { rm -- "$work/result.txt"; return 1; }
}
release_exit() {
  local status="$?"
  trap - EXIT INT TERM
  if [ "$compose_outcome_uncertain" -eq 1 ]; then
    echo "COMPOSE OUTCOME UNVERIFIED. No competing replacement was started. Private evidence: $work" >&8
    exit 70
  fi
  if [ "$status" -ne 0 ] && [ "$switch_started" -eq 1 ]; then
    if rollback; then
      echo "Candidate failed; exact predecessor is healthy locally and publicly. Private evidence: $work" >&8
    else
      echo "ROLLBACK FAILED OR UNVERIFIED. Private evidence: $work. Do not claim recovery." >&8
      exit 70
    fi
  elif [ "$status" -ne 0 ]; then
    if [ "$config_selector" = candidate ]; then
      echo "Candidate health was verified; finalization was interrupted. Private evidence: $work" >&8
    else
      echo "Development release blocked before replacement. Private evidence: $work" >&8
    fi
  fi
  exit "$status"
}
trap release_exit EXIT
trap 'if [ "$compose_in_flight" -eq 1 ]; then compose_outcome_uncertain=1; fi; exit 130' INT
trap 'if [ "$compose_in_flight" -eq 1 ]; then compose_outcome_uncertain=1; fi; exit 143' TERM
wait_healthy() {
  local which="$1" attempt
  for attempt in 1 2 3 4 5 6; do
    if healthy_pair "$which"; then return 0; fi
    [ "$attempt" -eq 6 ] || sleep 2
  done
  return 1
}
healthy_pair predecessor
run_docker inspect --format "$app_format" ccgh-app > "$work/app-baseline.json"
verify app "$record" predecessor /work/app-baseline.json
verify app-boundary /work/app-baseline.json /work/app-baseline.json
snapshot before
verify protected /work/before.json /work/before.json
# Read-only database backup with an actual archive-catalog check. Bytes never
# leave the host or enter the verifier mounts. Preserve it on every exit path.
test ! -L "$release_root/backups"
[ "$(cd -- "$release_root/backups" && pwd -P)" = "$authorized_release_root/backups" ]
backup="$(mktemp "$release_root/backups/pre-development-$candidate_sha.XXXXXX.dump")"
run_docker exec ccgh-postgres pg_dump -U "$db_user" -d "$db_name" -Fc > "$backup"
test -s "$backup"
run_docker exec -i ccgh-postgres pg_restore --list < "$backup" > /dev/null
regular_single_link "$backup"
backup_hash="$(sha256sum "$backup")"
printf '%s\n' "$backup_hash" > "$backup.sha256"
chmod 0400 "$backup" "$backup.sha256"
backup_identity="$(stat -Lc '%d:%i:%h:%s:%F:%a' -- "$backup")"
printf '%s\n' "$backup" > "$work/backup-path.txt"
# Retain a CC-GH-local recovery tag; rollback uses the verified immutable registry digest and never pulls.
run_docker image tag "$verifier_image" "ghcr.io/le-who/cc-gh:rollback-development-$candidate_sha"
[ "$(run_docker image inspect "ghcr.io/le-who/cc-gh:rollback-development-$candidate_sha" --format '{{.Id}}')" = "$verifier_image" ]
# Re-observe under the shared release lock immediately before replacement.
check_settings
healthy_pair predecessor
snapshot pre-switch
verify protected /work/before.json /work/pre-switch.json
# A once-checked archive is not enough: preserve its inode and exact bytes
# through the last pre-switch boundary, and reject symlinked backup evidence.
test ! -L "$release_root/backups"
[ "$(cd -- "$release_root/backups" && pwd -P)" = "$authorized_release_root/backups" ]
regular_single_link "$backup"; regular_single_link "$backup.sha256"
[ "$(stat -Lc '%d:%i:%h:%s:%F:%a' -- "$backup")" = "$backup_identity" ]
[ "$(sha256sum "$backup")" = "$backup_hash" ]
[ "$(cat -- "$backup.sha256")" = "$backup_hash" ]
create_marker
switch_started=1
compose_switch candidate
wait_healthy candidate
check_settings
snapshot after
verify protected /work/before.json /work/after.json
printf '%s\n' 'candidate-healthy; development-protocol-evolution; neighbor-application-health-not-proven' > "$work/result.txt"
# No new replacement may start after the durable interlock is removed. A signal
# during finalization must leave the verified app in place, not begin rollback.
switch_started=0
if ! clear_marker; then
  rm -- "$work/result.txt"
  echo "Release marker could not be reconciled. Private evidence: $work" >&8
  trap - EXIT INT TERM
  exit 70
fi
echo "Exact development app is healthy locally and publicly; protected process identities are unchanged. Evidence: $work"
