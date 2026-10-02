#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -f scripts/trivia-preview-serve.mjs ]; then cd ../..; fi
printf '%s\n' 'Trivia OFFLINE LOCAL PREVIEW - open http://127.0.0.1:4185/' 'Nothing is installed or downloaded. Stop with Ctrl+C.'
exec node scripts/trivia-preview-serve.mjs
