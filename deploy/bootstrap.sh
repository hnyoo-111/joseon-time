#!/usr/bin/env bash
# A14 · 사내 서버 초기 구성 (Linux). 루트로 1회 실행한다.
#   sudo bash bootstrap.sh
# 멱등하게 작성 — 재실행해도 안전하다.
set -euo pipefail

APP_ROOT="${APP_ROOT:-/srv/joseon-time}"
APP_USER="${APP_USER:-joseon}"
KTX_VER="${KTX_VER:-4.4.2}"

echo "== 1. 사용자·디렉터리 =="
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_ROOT" --shell /usr/sbin/nologin "$APP_USER"
# D-08: raw/ build/ 는 서빙 경로 밖, releases/ 만 Nginx 문서 루트가 된다
mkdir -p "$APP_ROOT"/{raw,build,releases,logs}
chown -R "$APP_USER":"$APP_USER" "$APP_ROOT"
chmod 750 "$APP_ROOT"

echo "== 2. 패키지 =="
if command -v apt-get >/dev/null; then
  apt-get update -qq
  apt-get install -y -qq nginx curl unzip python3 python3-requests certbot python3-certbot-dns-cloudflare
else
  dnf install -y nginx curl unzip python3 python3-pip certbot python3-certbot-dns-cloudflare
  pip3 install --quiet requests
fi

echo "== 3. Node 20+ =="
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
node --version

echo "== 4. gltf-transform CLI =="
npm install -g @gltf-transform/cli@4.4.2
# A5 실측: CLI 안에 sharp 0.34.x 와 중첩 sharp 0.35.x 가 공존하면 두 libvips 가 충돌해
# resize 단계가 100% 실패한다. 단일 버전으로 통일해야 한다.
CLI_DIR="$(dirname "$(readlink -f "$(command -v gltf-transform)")")/../lib/node_modules/@gltf-transform/cli"
[ -d "$CLI_DIR" ] || CLI_DIR="$(npm root -g)/@gltf-transform/cli"
( cd "$CLI_DIR" && npm install sharp@0.35.3 --no-save --silent )
gltf-transform --version

echo "== 5. KTX-Software (ktx CLI · ETC1S 인코딩에 필요) =="
if ! command -v ktx >/dev/null; then
  TMP=$(mktemp -d)
  curl -fsSL -o "$TMP/ktx.deb" \
    "https://github.com/KhronosGroup/KTX-Software/releases/download/v${KTX_VER}/KTX-Software-${KTX_VER}-Linux-x86_64.deb" \
    && dpkg -i "$TMP/ktx.deb" || {
      echo "!! KTX 자동 설치 실패 — https://github.com/KhronosGroup/KTX-Software/releases 에서 배포판에 맞는 패키지를 설치하라"; }
  rm -rf "$TMP"
fi
ktx --version || true

echo "== 6. 애플리케이션 파일 배치 =="
# 이 저장소의 deploy/scripts 와 data/scripts 를 서버로 복사해 둔 상태를 전제한다
install -o "$APP_USER" -g "$APP_USER" -m 750 -d "$APP_ROOT/scripts"
echo "  → scripts/ 에 build_release.mjs · secret_scan.mjs · publish.sh · sync_worker.py 를 배치하라"

echo "== 7. .env (Sketchfab 토큰) =="
if [ ! -f "$APP_ROOT/.env" ]; then
  echo "SKETCHFAB_TOKEN=" > "$APP_ROOT/.env"
  echo "  → $APP_ROOT/.env 에 토큰을 채워라"
fi
chown "$APP_USER":"$APP_USER" "$APP_ROOT/.env"
chmod 600 "$APP_ROOT/.env"

echo "== 8. Nginx 설정 =="
echo "  → [현행 운영은 Docker + Cloudflare Tunnel 이다. deploy/docker/README.md 를 따를 것]"
echo "    deploy/nginx/joseon-time.conf 는 TLS 없는 :80 전용이므로,"
echo "    이 베어메탈 경로로 쓰려면 아래 9번 certbot 과 listen 443 블록을 직접 추가해야 한다."

echo "== 9. TLS (DNS-01 · Cloudflare) =="
cat <<'EOS'
  # /root/.cloudflare.ini (chmod 600) 에 API 토큰을 넣고:
  #   dns_cloudflare_api_token = <Zone:DNS:Edit 권한 토큰>
  certbot certonly \
    --dns-cloudflare --dns-cloudflare-credentials /root/.cloudflare.ini \
    -d joseon-time.gaia3d.dev --agree-tos -m ghjo@gaia3d.com --non-interactive
  # DNS-01 을 쓰는 이유: D-12 로 프록시를 벗기므로 엣지 인증서를 쓸 수 없고,
  # HTTP-01 은 80 포트 노출을 요구한다. DNS-01 은 갱신도 무인으로 된다.
EOS

echo
echo "완료. 다음: 시딩(raw/) → build_release.mjs → publish.sh → DNS 전환"
