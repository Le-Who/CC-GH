## Description

Summarize the product/runtime behavior changed by this PR.

## Smoke Test Checklist

- [ ] `pnpm run build` succeeds.
- [ ] `pnpm run test:cleanup` succeeds.
- [ ] `pnpm test` succeeds or any local environment blocker is documented.
- [ ] Telegram Mini App mock boot reaches the shell.
- [ ] Farm, Blox, Match-3, Merge, and Trivia tabs are reachable.
- [ ] Socket.IO connects with authenticated Mini App init data or explicit dev auth.

## Data Safety

- [ ] Player save shape is preserved, or a migration is included.
- [ ] Account identity migration was dry-run before apply.
- [ ] Rollback path is documented from the pre-release PostgreSQL and Redis backups.

## Deployment

- [ ] Docker image builds locally.
- [ ] `docker compose up -d --remove-orphans` was smoke-tested on a VPS-like compose stack.
