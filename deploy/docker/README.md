# Docker 실행 (Cloudflare Tunnel)

`bootstrap.sh` 대신 컨테이너로 운영하는 방법. 설계(D-08/D-13/D-14)는 그대로다 —
**서빙 루트는 `releases/current` 뿐이고, `raw/`·`build/`는 마운트만 되고 서빙되지 않는다.**

네트워크: cloudflared 는 같은 대역의 **별도 호스트에서 이미 운영 중**이므로 이 compose 에는 없다.
`internet ── Cloudflare ── (기존 cloudflared 호스트) ── http://192.168.10.189:4001 ── nginx`,
사내(LAN)도 `192.168.10.189:4001` 로 직결. TLS 는 Cloudflare 가 종단하므로 certbot·인증서 마운트가 필요 없다.

**호스트 포트 대역 규약: 4001~4010 을 차례로 쓴다** — 4001 = nginx(HTTP), 4002~4010 = 예약.
(D-12 의 DNS-only 결정은 터널 운영으로 대체됨 — 외부 트래픽이 Cloudflare 프록시를 경유하므로
배포 후 실제 다운로드 속도를 검증할 것. 사내는 4001 직결이라 무관하다.)

경로 규약: **호스트는 `/data/joseon-time`, 컨테이너 내부는 항상 `/srv/joseon-time`.**
호스트 위치를 바꾸려면 `deploy/docker/.env` 의 `HOST_ROOT` 만 고치면 되고,
스크립트·nginx 설정은 손댈 필요가 없다.

## 0. compose 설정

```bash
cd deploy/docker
cp .env.example .env          # HOST_ROOT=/data/joseon-time
```
Cloudflare Zero Trust > Networks > Tunnels > (기존 터널) > Public Hostname 에
`joseon-time.gaia3d.dev → http://192.168.10.189:4001` 을 등록한다.

## 1. 호스트 준비 (1회)

```bash
sudo mkdir -p /data/joseon-time/{raw,build,releases,data,app,logs}
sudo sh -c 'echo "SKETCHFAB_TOKEN=<발급받은 Sketchfab 토큰>" > /data/joseon-time/.env'
sudo chmod 600 /data/joseon-time/.env

# 서버용 config.js (assetBase/modelFile 이 서버 값이어야 한다)
sudo tee /data/joseon-time/app/config.js >/dev/null <<'EOF'
window.JOSEON_CONFIG = {
  cesiumIonToken: '<도메인 제한된 Cesium ion 토큰>',
  assetBase: 'asset/',
  modelFile: 'scene.glb'
};
EOF
sudo cp joseon_time.html /data/joseon-time/app/
sudo cp data/*.json      /data/joseon-time/data/
```

## 2. TLS

없다. Cloudflare 가 종단하고 터널 구간은 cloudflared 가 암호화한다. certbot 불필요.
Cloudflare 대시보드에서 SSL/TLS 모드는 아무거나 무방하나 **Always Use HTTPS** 는 켜 둔다.

## 3. 시딩 → 빌드 → 게시

```bash
cd deploy/docker
docker compose build

# 원본 시딩: 원천 API에서 직접 받아 raw/ 에 축적 (NAS 불필요)
#   SYNC_LIMIT=0 → 이번 실행에서 받을 수 있는 만큼 전부
#   A13 실측: 다운로드 가능 899건 · 5초 페이싱 · API 약 1.3시간 + gltf 약 34GB 전송
docker compose run --rm -e SYNC_LIMIT=0 sync

# (선택) 먼저 규모를 확인만 하려면 — 아무것도 받지 않는 dry-run
docker compose run --rm sync python3 scripts/sync_worker.py

# 빌드 (먼저 20건으로 구성 확인 → 전량)
docker compose run --rm joseon build --limit 20
docker compose run --rm joseon build

# 게시
docker compose run --rm joseon publish r20260811

# 서빙 시작 (nginx + 터널)
docker compose up -d
curl -sI http://192.168.10.189:4001/healthz      # 사내 직결 확인 (호스트 포트 4001)
curl -I  https://joseon-time.gaia3d.dev/healthz  # 터널 경유 외부 확인
```

> **`publish.sh`의 `systemctl reload nginx`는 컨테이너에 systemd가 없어 실패한다.**
> 컨테이너에서는 게시 후 nginx만 따로 리로드한다(설정 파일 수정은 불필요):
> ```bash
> docker compose run --rm joseon publish r20260811 || true   # 스캔·무결성·링크 교체까지는 수행됨
> docker exec joseon-time nginx -s reload
> ```
> 스캔이나 무결성 검증에서 실패하면 `current` 링크는 바뀌지 않으므로 `|| true`를 붙여도 안전하다.
> 로그의 "게시 완료" 문구가 나왔는지로 성공을 판정하라.

### 시딩에 관한 메모

워커는 **디스크에 실물(`raw/{folder}/scene.gltf`)이 없는 것**을 받을 대상으로 판단한다.
따라서 빈 `raw/` 에서 실행하면 카탈로그의 506건과 미보유 393건을 합쳐 **899건 전량**을 한 번에 받는다
(다운로드 불가 18건은 제외). 중간에 끊겨도 이미 받은 건 건너뛰므로 그냥 다시 실행하면 이어진다.

- **한 번에 전량** — `SYNC_LIMIT=0`. 약 1.3시간 무인 실행. 가장 단순하다.
- **나눠서** — `SYNC_LIMIT=200` 처럼 상한을 두고 여러 번. 회선·쿼터가 걱정될 때.

429(쿼터 소진)가 나면 워커가 스스로 멈추고 남은 항목을 `sync-state.json` 의 재시도 큐에 넣는다.
다음 실행에서 자동으로 이어받으므로 별도 조치가 필요 없다.

## 3-1. SPA(신규 앱) 배포

배포 대상은 이제 단일 파일 `joseon_time.html` 이 아니라 Vite 빌드 산출물이다.
**앱은 `app/`, 에셋은 `releases/current`·`raw/`** 로 분리돼 있어 앱 교체가 릴리스 빌드를 기다리지 않는다.

로컬(개발 PC)에서 서버용으로 빌드하고 압축한다 — 동일 출처이므로 에셋 경로는 `/raw-asset/` 이다.
```powershell
$env:BASE_PATH='/'; $env:VITE_ASSET_BASE='/raw-asset/'; $env:VITE_ASSET_FILE='scene.gltf'
$env:VITE_CESIUM_ION_TOKEN='<ion 토큰>'
npm run build
tar -czf deploy/app-dist.tar.gz -C dist .
```

서버에서 풀고 nginx 를 리로드한다.
```bash
sudo tar -xzf app-dist.tar.gz -C /data/joseon-time/app/
cd ~/joseon-time/deploy/docker && docker compose up -d   # 설정 변경 반영
docker exec joseon-time nginx -t && docker exec joseon-time nginx -s reload
```

## 4. 주기 동기화 (호스트 cron)

systemd timer 대신 호스트 crontab에 등록한다:

```bash
# crontab -e
0 3 * * 1  cd /path/to/deploy/docker && docker compose run --rm sync >> /data/joseon-time/logs/sync.log 2>&1
```

수집(A13 실측: 15회/60초 쿼터 → 5초 페이싱)과 빌드까지 자동이고, **게시는 사람이 확인 후** 3번의 publish로 한다.

## 5. 구 경로 폐지 (A15)

Cloudflare에서 `heritage-assets.gaia3d.dev` 레코드·rule 삭제 → NAS 인바운드 차단.
`joseon-time` DNS 는 터널의 Public Hostname 등록 시 CNAME 이 자동 생성되므로 손댈 것 없다.

## 자주 쓰는 명령

| 목적 | 명령 |
|---|---|
| 릴리스 목록 | `docker compose run --rm joseon publish --list` |
| 롤백 | `docker compose run --rm joseon publish <직전ID>` + `docker exec joseon-time nginx -s reload` |
| 시크릿 스캔만 | `docker compose run --rm joseon scan /srv/joseon-time/releases/<ID>` (컨테이너 내부 경로) |
| 로그 | `docker logs -f joseon-time` |
