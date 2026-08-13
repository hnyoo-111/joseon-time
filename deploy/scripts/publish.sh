#!/usr/bin/env bash
# S8 게시 — current 링크 전환. 롤백은 같은 스크립트로 직전 릴리스를 지정하면 된다(D-10).
#   bash publish.sh r20260811        # 게시
#   bash publish.sh --list           # 릴리스 목록
#   bash publish.sh --rollback       # 직전 릴리스로 되돌리기
set -euo pipefail

APP_ROOT="${APP_ROOT:-/srv/joseon-time}"
RELEASES="$APP_ROOT/releases"
CURRENT="$RELEASES/current"
HISTORY="$APP_ROOT/logs/publish-history.log"

list() { ls -1 "$RELEASES" | grep -E '^r[0-9]{8}' | sort; }

case "${1:-}" in
  --list)
    echo "현재: $([ -L "$CURRENT" ] && basename "$(readlink -f "$CURRENT")" || echo '(없음)')"
    list ;;
  --rollback)
    prev=$(grep -E '^[0-9-]+ .* -> ' "$HISTORY" 2>/dev/null | tail -2 | head -1 | sed 's/.*-> //') || true
    [ -n "${prev:-}" ] || { echo "롤백 대상 없음 — publish.sh --list 로 직접 지정하라"; exit 1; }
    exec "$0" "$prev" ;;
  '')
    echo "사용법: publish.sh <릴리스ID> | --list | --rollback"; exit 2 ;;
esac

REL_ID="$1"
REL="$RELEASES/$REL_ID"
[ -d "$REL" ] || { echo "없는 릴리스: $REL"; exit 1; }
[ -f "$REL/manifest.json" ] || { echo "manifest.json 없음 — 완결되지 않은 릴리스"; exit 1; }

echo "== 1. 시크릿 스캔 =="
node "$APP_ROOT/scripts/secret_scan.mjs" "$REL"

echo "== 2. 무결성 검증 (manifest 대조) =="
node -e '
const fs=require("fs"),path=require("path"),{createHash}=require("crypto");
const rel=process.argv[1];
const m=JSON.parse(fs.readFileSync(path.join(rel,"manifest.json"),"utf8"));
let bad=0,n=0;
for(const [f,want] of Object.entries(m.files)){
  const p=path.join(rel,f);
  if(!fs.existsSync(p)){console.error("  누락:",f);bad++;continue;}
  const got=createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  if(got!==want){console.error("  변조:",f);bad++;}
  n++;
}
if(bad){console.error(`무결성 실패 — ${bad}건`);process.exit(1);}
console.log(`  ${n}개 파일 sha256 일치`);
' "$REL"

echo "== 3. current 전환 =="
prev=$([ -L "$CURRENT" ] && basename "$(readlink -f "$CURRENT")" || echo "-")
ln -sfn "$REL" "$CURRENT.new" && mv -Tf "$CURRENT.new" "$CURRENT"   # 원자적 교체
mkdir -p "$(dirname "$HISTORY")"
echo "$(date -Iseconds) $prev -> $REL_ID" | tee -a "$HISTORY"

echo "== 4. Nginx 반영 =="
nginx -t && systemctl reload nginx

echo "== 5. 확인 =="
curl -fsS -o /dev/null -w "  healthz HTTP %{http_code}\n" https://joseon-time.gaia3d.dev/healthz || true
curl -fsS -o /dev/null -w "  index   HTTP %{http_code}\n" https://joseon-time.gaia3d.dev/ || true

echo "게시 완료: $REL_ID (직전 $prev — 되돌리려면 publish.sh $prev)"
