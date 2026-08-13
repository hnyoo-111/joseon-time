#!/usr/bin/env bash
set -euo pipefail
APP_ROOT="${APP_ROOT:-/srv/joseon-time}"
cd "$APP_ROOT"

case "${1:-serve}" in
  serve)     # 기본 — Nginx 포그라운드
    mkdir -p "$APP_ROOT"/{raw,build,releases,logs,data,app}
    [ -L "$APP_ROOT/releases/current" ] || echo "!! releases/current 없음 — 먼저 build/publish 를 돌려라"
    exec nginx -g 'daemon off;'
    ;;
  sync)      # 주기 실행 — S1 수집 → S7 빌드 (게시는 사람이)
    python3 scripts/sync_worker.py --apply --limit "${SYNC_LIMIT:-120}"
    node scripts/build_release.mjs
    ;;
  build)     shift; exec node scripts/build_release.mjs "$@" ;;
  publish)   shift; exec bash scripts/publish.sh "$@" ;;
  scan)      shift; exec node scripts/secret_scan.mjs "$@" ;;
  *)         exec "$@" ;;
esac
