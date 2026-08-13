# A14 · 사내 서버 세팅 (Linux + Nginx)

운영 아키텍처 v0.3(`docs/operations-architecture.html`)의 D-08·D-12·D-13·D-14를 그대로 구현한 배포 키트.
**서버 1대가 수집·정리·서빙을 모두 한다.** 브라우저는 이 서버만 만나고, 서빙되는 것은 최적화 배포본뿐이다.

```
/srv/joseon-time/
├── .env                     # SKETCHFAB_TOKEN (600, joseon 소유)
├── app/                     # joseon_time.html · config.js  ← 릴리스에 복사됨
├── data/                    # assets.catalog.json 등 큐레이션 산출물
├── raw/                     # 원본 gltf (서빙 경로 밖)
├── build/                   # 중간 산출물 (서빙 경로 밖)
├── releases/
│   ├── r20260811/           # 불변 — 게시 후 수정 금지
│   │   ├── asset/{folder}/{scene.glb, scene.lod1.glb}
│   │   ├── data/ · joseon_time.html · config.js
│   │   └── manifest.json    # 파일별 sha256 + 직전 대비 변경
│   └── current -> r20260811 # Nginx 문서 루트. 롤백 = 링크 되돌리기
├── scripts/                 # build_release.mjs · secret_scan.mjs · publish.sh · sync_worker.py
└── logs/
```

## 실행 순서

### 1. 서버 준비
```bash
sudo APP_ROOT=/srv/joseon-time bash bootstrap.sh
```
Node 20 · gltf-transform 4.4.2 · KTX-Software · Nginx · certbot을 설치하고 디렉터리를 만든다.

> **A5 실측 주의** — gltf-transform CLI 내부에 sharp가 두 버전 공존하면 libvips가 충돌해
> `resize` 단계가 **100% 실패**한다. bootstrap.sh가 `sharp@0.35.3` 단일화까지 수행한다.
> ETC1S 인코딩은 `ktx` CLI를 호출하므로 KTX-Software가 없으면 텍스처 압축이 실패한다.

### 2. 파일 배치
```bash
# 이 저장소에서 서버로
scp deploy/scripts/*            서버:/srv/joseon-time/scripts/
scp data/scripts/sync_worker.py 서버:/srv/joseon-time/scripts/
scp data/*.json                 서버:/srv/joseon-time/data/
scp joseon_time.html config.js  서버:/srv/joseon-time/app/
```
서버의 `app/config.js`는 **서버용 값**이어야 한다 — `assetBase: 'asset/'`, `modelFile: 'scene.glb'`
(저장소의 `config.js`는 로컬 개발용으로 `heritage/asset/` + `scene.gltf`를 가리킨다).

### 3. 시딩 — 원본 확보
사내망 이관이 가장 빠르다. NAS의 현행 `asset/`을 서버 `raw/`로 1회 복사한다(506건).
```bash
rsync -a --info=progress2 NAS:/…/heritage/asset/ /srv/joseon-time/raw/
```
NAS를 쓰지 않는다면 API로도 받을 수 있다(A13 실측: 전량 약 1.3시간 + 전송):
```bash
sudo -u joseon python3 scripts/sync_worker.py --apply --limit 120
```

### 4. 빌드 → 검사 → 게시
```bash
sudo -u joseon node scripts/build_release.mjs --limit 20   # 먼저 20건으로 구성 검증
sudo -u joseon node scripts/build_release.mjs              # 전량 (506건 ≈ 1.7시간)
bash scripts/publish.sh r20260811
```
`publish.sh`는 **시크릿 스캔 → manifest sha256 대조 → current 원자적 교체 → nginx reload** 순으로 진행하며,
어느 단계든 실패하면 게시하지 않는다.

### 5. TLS · DNS
> 현행 운영은 **Docker + Cloudflare Tunnel**(`deploy/docker/README.md`)이며 TLS 는 Cloudflare 가 종단한다.
> `deploy/nginx/joseon-time.conf` 는 `listen 80` 전용이므로 아래 베어메탈 경로에는 443 블록 추가가 필요하다.

```bash
cp deploy/nginx/joseon-time.conf /etc/nginx/conf.d/
certbot certonly --dns-cloudflare --dns-cloudflare-credentials /root/.cloudflare.ini \
  -d joseon-time.gaia3d.dev --agree-tos -m ghjo@gaia3d.com --non-interactive
nginx -t && systemctl reload nginx
```
그다음 Cloudflare DNS에 `joseon-time` A 레코드를 서버 IP로 추가하고 **프록시를 끈다(DNS-only · 회색 구름)**.
프록시를 켜면 실측된 해외 PoP(SJC) 경유로 되돌아가 0.6~2.6 MB/s로 떨어진다(D-12).

### 6. 주기 동기화 등록
```bash
cp deploy/systemd/joseon-sync.* /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now joseon-sync.timer
systemctl list-timers joseon-sync.timer
```
주 1회(월 03:00) 수집→빌드까지 자동. **게시는 사람이 확인 후 `publish.sh`로 한다** —
자동 게시를 원하면 service 파일의 마지막 ExecStart 주석을 해제한다.

### 7. 구 경로 폐지 (A15) — 게시 확인 후
- Cloudflare에서 `heritage-assets.gaia3d.dev` DNS 레코드와 전용 rule 삭제
- NAS 포트포워딩 제거 · QuickConnect류 비활성 · 방화벽 인바운드 거부
- 검증: `curl -sI https://heritage-assets.gaia3d.dev/scripts/check_sketchfab_api.py` → 응답 없어야 정상

## 검증 체크리스트

| 항목 | 명령 | 기대 |
|---|---|---|
| PoP 우회 확인 | `curl -sI https://joseon-time.gaia3d.dev/ \| grep -i cf-ray` | **헤더 없음**(Cloudflare 미경유) |
| 국내 직결 속도 | `curl -o /dev/null -w '%{speed_download}\n' …/asset/<f>/scene.glb` | 회선 속도 수준 |
| 불변 캐시 | `curl -sI …/asset/<f>/scene.glb \| grep -i cache-control` | `immutable` |
| 원본 비노출 | `curl -sI https://joseon-time.gaia3d.dev/raw/` | 404 |
| 디렉터리 목록 | `curl -s https://joseon-time.gaia3d.dev/asset/` | 403/404 |
| 롤백 | `bash scripts/publish.sh --list` → 직전 ID로 재게시 | 즉시 복귀 |

## 알려진 제약

- **CSP의 `'unsafe-inline'`(script)** — `joseon_time.html`이 아직 단일 파일 인라인 스크립트다. A10(모듈 분리) 후 제거 가능.
- **`'wasm-unsafe-eval'`은 필수** — Cesium의 Basis 트랜스코더가 WebAssembly다. 빼면 ETC1S 텍스처가 디코딩되지 않아 모델이 보이지 않는다.
- **백업 없음**(사용자 결정) — 원본은 원천 재수집으로 복구하지만, `data/`의 큐레이션 산출물(placements 등)은 유일본이다. git 도입 전까지 서버 외 사본 1벌을 유지할 것.
