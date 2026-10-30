#!/usr/bin/env bash
# One transport worker, one unchanged release helper, no retry or rollback owner.
set +x
set -euo pipefail
umask 077
readonly release_root=/opt/game-hub
readonly stage_dir=/opt/game-hub/releases/yard-development-ad12c20803c795d544f7a5583cd1eb3f1e362edb629e8109ce08bd9fa50017b5
readonly packet=/opt/game-hub/releases/yard-development-ad12c20803c795d544f7a5583cd1eb3f1e362edb629e8109ce08bd9fa50017b5/packet
readonly approved=ad12c20803c795d544f7a5583cd1eb3f1e362edb629e8109ce08bd9fa50017b5
readonly predecessor_commit=01fb01b3ca92f239682a5c63021e002d41a1f685
readonly predecessor_image=sha256:82c880dc2ec4a5aa0fceeeea595446d33c30e2f0acea2984e4b981dda261b806
readonly candidate_commit=d09e7296af6e9499a0cd19322c6fda73dfcabef7
readonly candidate_digest=sha256:491a7a7fcf3caa64af667827a0d5a3c045f818f909571da47c0e1a7fed209757
readonly candidate_image=sha256:f901f9976808ebd8ed74e73717d1b84dd72e56319c677acc7b0b47f7084fdb3c
readonly predecessor_digest=sha256:d476a5e808761496b90609f4923f9d87038263db1a69631afca4977a20476195
stage=transport_checks
deadline_signalled=false
cleanup_registry_auth() {
  local auth_dir="$stage_dir/registry-auth"
  if [ ! -e "$auth_dir" ] && [ ! -L "$auth_dir" ]; then return 0; fi
  test -d "$auth_dir" && test ! -L "$auth_dir" || return 1
  [ "$(cd -- "$auth_dir" && pwd -P)" = "$auth_dir" ] || return 1
  rm -rf -- "$auth_dir" || return
  test ! -e "$auth_dir" && test ! -L "$auth_dir"
}
finish() {
  status=$?
  trap - EXIT
  if [ "$deadline_signalled" = true ]; then status=143; fi
  cleanup_registry_auth || status=70
  unset YARD_GHCR_TOKEN YARD_GHCR_USER
  printf '{"format":"cc-gh-yard-activation-transport/v1","workerTerminal":true,"stage":"%s","exitCode":%s,"helperSucceeded":%s,"recordSha256":"%s"}\n' \
    "$stage" "$status" "$([ "$stage" = helper_completed ] && [ "$status" -eq 0 ] && printf true || printf false)" "$approved" > "$stage_dir/transport-status.tmp"
  mv -- "$stage_dir/transport-status.tmp" "$stage_dir/transport-status.json"
  exit "$status"
}
trap finish EXIT
# Bash defers this trap while waiting for a foreground child. The existing
# helper therefore handles its own TERM first; the whole group remains under
# the deadline monitor until it returns or the KILL grace expires.
trap 'deadline_signalled=true; exit 143' TERM
run_docker() { timeout --foreground --kill-after=5s 120s docker "$@"; }
safe_file() { test -f "$1" && test ! -L "$1" && [ "$(stat -Lc '%h' -- "$1")" = 1 ]; }
for option in DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH DOCKER_CONFIG; do [ -z "${!option:-}" ]; done
for directory in "$release_root" "$release_root/releases" "$stage_dir" "$stage_dir/tools" "$packet"; do
  test -d "$directory"; test ! -L "$directory"; [ "$(cd -- "$directory" && pwd -P)" = "$directory" ]
done
cd -- "$stage_dir"
safe_file "$stage_dir/packet/development-record.json"
[ "$(sha256sum -- "$stage_dir/packet/development-record.json" | cut -d ' ' -f 1)" = ad12c20803c795d544f7a5583cd1eb3f1e362edb629e8109ce08bd9fa50017b5 ]
safe_file "$stage_dir/packet/predecessor-receipt.json"
[ "$(sha256sum -- "$stage_dir/packet/predecessor-receipt.json" | cut -d ' ' -f 1)" = b0a64e9180f0f729910b37b62978c4a3be9b6cbe8cff55a271e43d0fb5f35a4f ]
safe_file "$stage_dir/packet/candidate-receipt.json"
[ "$(sha256sum -- "$stage_dir/packet/candidate-receipt.json" | cut -d ' ' -f 1)" = 957651a59f40e138f321d90fe337dbda97cb71a269b24719ca3a24880b74e4ea ]
safe_file "$stage_dir/tools/ccgh-app-development-release.sh"
[ "$(sha256sum -- "$stage_dir/tools/ccgh-app-development-release.sh" | cut -d ' ' -f 1)" = dc705de397a2a266012b41ba05447b6b14e4af4e0a5e3f77f1fd1dd16f7da6b4 ]
safe_file "$stage_dir/tools/yard-development-contract.mjs"
[ "$(sha256sum -- "$stage_dir/tools/yard-development-contract.mjs" | cut -d ' ' -f 1)" = 1a016b65b3f828eb4659a9644372fc42eae80779a23f42c12cdd62fc45bd2e96 ]
safe_file "$stage_dir/tools/environment.go.tmpl"
[ "$(sha256sum -- "$stage_dir/tools/environment.go.tmpl" | cut -d ' ' -f 1)" = 6be4f89236ae91ddd41b106206c279c43cdc61abe0e88e7c73d551c317b6f979 ]
for file in .env docker-compose.yml .release.lock; do safe_file "$release_root/$file"; done
env_identity_before="$(stat -Lc '%d:%i:%s:%y:%z' -- "$release_root/.env")"
[ "$(sha256sum -- "$release_root/docker-compose.yml" | cut -d ' ' -f 1)" = d5e6e1e6afef6733ce340ccc9b3eefb45630ac2dba14ac9810a9af1676293a4f ]
test ! -e "$release_root/.yard-development-inflight"; test ! -L "$release_root/.yard-development-inflight"
[ "$(run_docker context show)" = default ]
[ "$(run_docker context inspect default --format '{{.Endpoints.docker.Host}}')" = unix:///var/run/docker.sock ]
[ "$(run_docker inspect --format '{{.Image}}' ccgh-app)" = "$predecessor_image" ]
# Narrow runtime pins, evaluated before any host staging, pull, backup, or switch.
# No raw environment, connection string, row, or diagnostic is emitted.
for option in DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH DOCKER_CONFIG; do [ -z "${!option:-}" ]; done
run_docker() { timeout --foreground --kill-after=5s 30s docker "$@"; }
[ "$(run_docker context show)" = default ]
[ "$(run_docker context inspect default --format '{{.Endpoints.docker.Host}}')" = unix:///var/run/docker.sock ]
[ "$(run_docker inspect --format '{{.Image}}' ccgh-app)" = sha256:82c880dc2ec4a5aa0fceeeea595446d33c30e2f0acea2984e4b981dda261b806 ]
[ "$(run_docker inspect --format '{{len .Mounts}}' ccgh-app)" = 0 ]
[ "$(run_docker inspect --format '{{and (eq (len .HostConfig.PortBindings) 1) (eq (len (index .HostConfig.PortBindings "8080/tcp")) 1)}}{{range (index .HostConfig.PortBindings "8080/tcp")}}{{and (eq .HostIp "127.0.0.1") (eq .HostPort "18080")}}{{end}}' ccgh-app)" = truetrue ]
database_environment_template='{{- $user := false -}}{{- $database := false -}}{{- $seenUser := false -}}{{- $seenDatabase := false -}}{{- $ambiguous := false -}}{{- range .Config.Env -}}{{- $key := index (split . "=") 0 -}}{{- if eq $key "POSTGRES_USER" -}}{{- if $seenUser -}}{{- $ambiguous = true -}}{{- end -}}{{- $seenUser = true -}}{{- $user = eq . "POSTGRES_USER=appuser" -}}{{- end -}}{{- if eq $key "POSTGRES_DB" -}}{{- if $seenDatabase -}}{{- $ambiguous = true -}}{{- end -}}{{- $seenDatabase = true -}}{{- $database = eq . "POSTGRES_DB=gamehub" -}}{{- end -}}{{- end -}}{{and $user $database (not $ambiguous)}}'
[ "$(run_docker inspect --format "$database_environment_template" ccgh-postgres)" = true ]
database_target_program='try { const u = new URL(process.env.DATABASE_URL); process.stdout.write(String(u.protocol === "postgresql:" && u.hostname === "postgres" && (u.port === "" || u.port === "5432") && u.username === "appuser" && u.pathname === "/gamehub" && u.search === "" && u.hash === "")); } catch { process.stdout.write("false"); }'
[ "$(run_docker exec -e NODE_OPTIONS= -e NODE_PATH= -e LD_PRELOAD= -e LD_LIBRARY_PATH= ccgh-app /usr/local/bin/node --input-type=module -e "$database_target_program")" = true ]
database_probe="$(run_docker exec -e PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=10000 -c lock_timeout=3000' ccgh-postgres psql -X -A -t -v ON_ERROR_STOP=1 -U appuser -d gamehub -c "SELECT current_user = 'appuser' AND current_database() = 'gamehub', pg_database_size(current_database());")"
[[ "$database_probe" =~ ^t\|([0-9]{1,15})$ ]]
database_bytes="${BASH_REMATCH[1]}"
[[ "$database_bytes" =~ ^(0|[1-9][0-9]*)$ ]]
test -d "$release_root/backups"; test ! -L "$release_root/backups"
[ "$(cd -- "$release_root/backups" && pwd -P)" = "$release_root/backups" ]
docker_root="$(run_docker info --format '{{.DockerRootDir}}')"
[[ "$docker_root" =~ ^/[A-Za-z0-9_./-]+$ ]]; test -d "$docker_root"
backup_available_kib="$(df -Pk -- "$release_root/backups" | awk 'NR==2{print $4}')"
docker_available_kib="$(df -Pk -- "$docker_root" | awk 'NR==2{print $4}')"
[[ "$backup_available_kib" =~ ^(0|[1-9][0-9]{0,14})$ && "$docker_available_kib" =~ ^(0|[1-9][0-9]{0,14})$ ]]
backup_required_kib=$(((database_bytes + 1023) / 1024 * 2))
protected_reserve_kib=4194304
candidate_pull_allowance_kib=4194304
if [ "$(stat -Lc '%d' -- "$release_root/backups")" = "$(stat -Lc '%d' -- "$docker_root")" ]; then
  [ "$backup_available_kib" -ge "$((backup_required_kib + protected_reserve_kib + candidate_pull_allowance_kib))" ]
else
  [ "$backup_available_kib" -ge "$((backup_required_kib + protected_reserve_kib))" ]
  [ "$docker_available_kib" -ge "$((protected_reserve_kib + candidate_pull_allowance_kib))" ]
fi
printf '{"runtimePinsVerified":true,"databaseSizeBytes":%s,"backupAvailableKiB":%s,"dockerAvailableKiB":%s,"requiredBackupKiB":%s,"protectedReserveKiB":%s,"candidatePullAllowanceKiB":%s,"capacityPassed":true}\n' \
  "$database_bytes" "$backup_available_kib" "$docker_available_kib" "$backup_required_kib" "$protected_reserve_kib" "$candidate_pull_allowance_kib"

stage=image_availability
# Only the current job token and this exact registry digest are authorized.
# No token is placed in argv, source, receipts, evidence, or the default config.
if ! run_docker image inspect "ghcr.io/le-who/cc-gh@$candidate_digest" --format '{{.Id}}' >/dev/null; then
  [ -n "${YARD_GHCR_TOKEN:-}" ]
  actor_pattern='^[A-Za-z0-9][A-Za-z0-9_-]{0,99}(\[bot\])?$'
  [[ "${YARD_GHCR_USER:-}" =~ $actor_pattern ]]
  auth_dir="$stage_dir/registry-auth"
  test ! -e "$auth_dir"; test ! -L "$auth_dir"
  mkdir -m 0700 -- "$auth_dir"
  # A scoped auths entry suppresses automatic host credential-helper selection.
  printf '%s\n' '{"auths":{"ghcr.io":{}}}' > "$auth_dir/config.json"
  chmod 0600 "$auth_dir/config.json"
  printf '%s' "$YARD_GHCR_TOKEN" | timeout --foreground --kill-after=5s 30s docker --config "$auth_dir" --host unix:///var/run/docker.sock login ghcr.io --username "$YARD_GHCR_USER" --password-stdin >/dev/null 2>&1
  timeout --foreground --kill-after=5s 180s docker --config "$auth_dir" --host unix:///var/run/docker.sock pull "ghcr.io/le-who/cc-gh@$candidate_digest"
fi
cleanup_registry_auth
unset YARD_GHCR_TOKEN YARD_GHCR_USER
[ "$(run_docker image inspect "ghcr.io/le-who/cc-gh@$candidate_digest" --format '{{.Id}}')" = "$candidate_image" ]
[ "$(run_docker image inspect "$candidate_image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$candidate_commit" ]
stage=environment_gate
environment_template="$(cat -- "$stage_dir/tools/environment.go.tmpl")"
readonly expected_environment='{"nodeEnvProduction":true,"devAuthDisabled":true,"nodePreloadAbsent":true,"expectedBuildConfigured":true,"unambiguousKeys":true}'
# Evaluate in Docker's formatter; output consists only of five boolean fields.
# The proven compose source plus unchanged .env/config hash are checked again by
# the helper. No environment values are sent to a probe container or CI logs.
[ "$(run_docker inspect --format "${environment_template//__EXPECTED_BUILD__/$predecessor_commit}" ccgh-app)" = "$expected_environment" ]
[ "$(run_docker image inspect "$candidate_image" --format "${environment_template//__EXPECTED_BUILD__/$candidate_commit}")" = "$expected_environment" ]
# Narrow runtime pins, evaluated before any host staging, pull, backup, or switch.
# No raw environment, connection string, row, or diagnostic is emitted.
for option in DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH DOCKER_CONFIG; do [ -z "${!option:-}" ]; done
run_docker() { timeout --foreground --kill-after=5s 30s docker "$@"; }
[ "$(run_docker context show)" = default ]
[ "$(run_docker context inspect default --format '{{.Endpoints.docker.Host}}')" = unix:///var/run/docker.sock ]
[ "$(run_docker inspect --format '{{.Image}}' ccgh-app)" = sha256:82c880dc2ec4a5aa0fceeeea595446d33c30e2f0acea2984e4b981dda261b806 ]
[ "$(run_docker inspect --format '{{len .Mounts}}' ccgh-app)" = 0 ]
[ "$(run_docker inspect --format '{{and (eq (len .HostConfig.PortBindings) 1) (eq (len (index .HostConfig.PortBindings "8080/tcp")) 1)}}{{range (index .HostConfig.PortBindings "8080/tcp")}}{{and (eq .HostIp "127.0.0.1") (eq .HostPort "18080")}}{{end}}' ccgh-app)" = truetrue ]
database_environment_template='{{- $user := false -}}{{- $database := false -}}{{- $seenUser := false -}}{{- $seenDatabase := false -}}{{- $ambiguous := false -}}{{- range .Config.Env -}}{{- $key := index (split . "=") 0 -}}{{- if eq $key "POSTGRES_USER" -}}{{- if $seenUser -}}{{- $ambiguous = true -}}{{- end -}}{{- $seenUser = true -}}{{- $user = eq . "POSTGRES_USER=appuser" -}}{{- end -}}{{- if eq $key "POSTGRES_DB" -}}{{- if $seenDatabase -}}{{- $ambiguous = true -}}{{- end -}}{{- $seenDatabase = true -}}{{- $database = eq . "POSTGRES_DB=gamehub" -}}{{- end -}}{{- end -}}{{and $user $database (not $ambiguous)}}'
[ "$(run_docker inspect --format "$database_environment_template" ccgh-postgres)" = true ]
database_target_program='try { const u = new URL(process.env.DATABASE_URL); process.stdout.write(String(u.protocol === "postgresql:" && u.hostname === "postgres" && (u.port === "" || u.port === "5432") && u.username === "appuser" && u.pathname === "/gamehub" && u.search === "" && u.hash === "")); } catch { process.stdout.write("false"); }'
[ "$(run_docker exec -e NODE_OPTIONS= -e NODE_PATH= -e LD_PRELOAD= -e LD_LIBRARY_PATH= ccgh-app /usr/local/bin/node --input-type=module -e "$database_target_program")" = true ]
database_probe="$(run_docker exec -e PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=10000 -c lock_timeout=3000' ccgh-postgres psql -X -A -t -v ON_ERROR_STOP=1 -U appuser -d gamehub -c "SELECT current_user = 'appuser' AND current_database() = 'gamehub', pg_database_size(current_database());")"
[[ "$database_probe" =~ ^t\|([0-9]{1,15})$ ]]
database_bytes="${BASH_REMATCH[1]}"
[[ "$database_bytes" =~ ^(0|[1-9][0-9]*)$ ]]
test -d "$release_root/backups"; test ! -L "$release_root/backups"
[ "$(cd -- "$release_root/backups" && pwd -P)" = "$release_root/backups" ]
docker_root="$(run_docker info --format '{{.DockerRootDir}}')"
[[ "$docker_root" =~ ^/[A-Za-z0-9_./-]+$ ]]; test -d "$docker_root"
backup_available_kib="$(df -Pk -- "$release_root/backups" | awk 'NR==2{print $4}')"
docker_available_kib="$(df -Pk -- "$docker_root" | awk 'NR==2{print $4}')"
[[ "$backup_available_kib" =~ ^(0|[1-9][0-9]{0,14})$ && "$docker_available_kib" =~ ^(0|[1-9][0-9]{0,14})$ ]]
backup_required_kib=$(((database_bytes + 1023) / 1024 * 2))
protected_reserve_kib=4194304
candidate_pull_allowance_kib=4194304
if [ "$(stat -Lc '%d' -- "$release_root/backups")" = "$(stat -Lc '%d' -- "$docker_root")" ]; then
  [ "$backup_available_kib" -ge "$((backup_required_kib + protected_reserve_kib + candidate_pull_allowance_kib))" ]
else
  [ "$backup_available_kib" -ge "$((backup_required_kib + protected_reserve_kib))" ]
  [ "$docker_available_kib" -ge "$((protected_reserve_kib + candidate_pull_allowance_kib))" ]
fi
printf '{"runtimePinsVerified":true,"databaseSizeBytes":%s,"backupAvailableKiB":%s,"dockerAvailableKiB":%s,"requiredBackupKiB":%s,"protectedReserveKiB":%s,"candidatePullAllowanceKiB":%s,"capacityPassed":true}\n' \
  "$database_bytes" "$backup_available_kib" "$docker_available_kib" "$backup_required_kib" "$protected_reserve_kib" "$candidate_pull_allowance_kib"

safe_file "$release_root/.env"
[ "$(stat -Lc '%d:%i:%s:%y:%z' -- "$release_root/.env")" = "$env_identity_before" ]
[ "$(sha256sum -- "$release_root/docker-compose.yml" | cut -d ' ' -f 1)" = d5e6e1e6afef6733ce340ccc9b3eefb45630ac2dba14ac9810a9af1676293a4f ]
stage=release_helper
# The helper owns the shared lock, backup, durable inflight marker, app-only
# switch, health/protected checks, and any single permitted rollback.
if YARD_TRANSPORT_ENV_IDENTITY="$env_identity_before" bash "$stage_dir/tools/ccgh-app-development-release.sh" "$packet" "$approved" "$release_root" "$predecessor_image" "$predecessor_digest"; then
  stage=helper_completed
else
  status=$?
  exit "$status"
fi
