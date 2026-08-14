# 189 셀프호스티드 러너 — 설치·보안 런북

dev 브랜치 푸시 → `.github/workflows/deploy-189.yml` → 189 서버 자동 배포.
러너는 GitHub 에 **아웃바운드 HTTPS 로만** 접속한다(long-poll). 사내망으로 들어오는
경로를 새로 만들지 않으며, WARP·터널·포트포워딩이 필요 없다.

## 0. 보안 전제 — 저장소가 public 이다 (반드시 먼저)

GitHub 은 public 저장소의 셀프호스티드 러너를 권장하지 않는다. 포크 PR 이 러너에서
코드를 실행하는 경로를 막아야 한다. **Settings 에서 아래를 켠 뒤에 러너를 등록하라.**

1. `Settings > Actions > General`
   - Fork pull request workflows: **"Require approval for all outside collaborators"**
   - Workflow permissions: **Read repository contents** (기본 쓰기 권한 해제)
2. 워크플로 규칙 (코드 리뷰에서 지킬 것)
   - `runs-on: self-hosted` 는 **push 트리거 워크플로에만** 쓴다.
     `pull_request` 트리거와 self-hosted 를 절대 한 워크플로에 섞지 않는다.
3. 러너 계정은 배포에 필요한 권한만 갖는다(아래 1번). root 로 돌리지 않는다.

## 1. 서버 준비 (189, 1회)

```bash
# 전용 계정 — 배포 대상 디렉터리와 docker 만 만질 수 있다
sudo useradd -m -s /bin/bash ghrunner
sudo usermod -aG docker ghrunner                     # nginx reload 용 (docker exec)
sudo chown -R ghrunner:ghrunner /data/joseon-time/app # 배포 대상 쓰기 권한
# rsync 필요
sudo apt-get install -y rsync
```

## 2. 러너 등록 (189, 1회)

GitHub 저장소 `Settings > Actions > Runners > New self-hosted runner` 에서
Linux x64 를 고르면 등록 토큰이 포함된 명령이 나온다. **ghrunner 계정으로** 실행:

```bash
sudo -iu ghrunner
mkdir actions-runner && cd actions-runner
curl -o actions-runner.tar.gz -L https://github.com/actions/runner/releases/latest/download/actions-runner-linux-x64-<버전>.tar.gz
tar xzf actions-runner.tar.gz
# --disableupdate 는 넣지 않는다 — 러너 자동 업데이트(보안 패치)를 켜 둔다.
./config.sh --url https://github.com/hnyoo-111/joseon-time \
            --token <등록 토큰> \
            --name runner-189 \
            --labels deploy-189
exit

# systemd 서비스로 상주
cd /home/ghrunner/actions-runner
sudo ./svc.sh install ghrunner
sudo ./svc.sh start
sudo ./svc.sh status
```

라벨 `deploy-189` 가 워크플로의 `runs-on: [self-hosted, linux, deploy-189]` 와 짝이다.

## 3. 저장소 시크릿 (1회)

`Settings > Secrets and variables > Actions` 에 `VITE_CESIUM_ION_TOKEN` 이 있어야 한다
(Pages 워크플로가 이미 쓰고 있으면 재사용된다).

## 4. 동작 확인

```bash
git switch dev && git commit --allow-empty -m "ci: 배포 파이프 확인" && git push
```
Actions 탭에서 `Deploy to 189 (dev)` 실행 → 마지막 Smoke check 가 초록이면 끝.
실패 시 러너 로그: `journalctl -u actions.runner.* -f`

## 주의 — /tiles 는 배포가 건드리지 않는다

`public/tiles/`(1919 지형도 50MB)는 라이선스 확인 전이라 저장소에 없다.
서버의 `/data/joseon-time/app/tiles/` 에 상주하며, 배포 rsync 는 `--exclude=/tiles` 로
보존한다. 갱신이 필요하면 로컬에서 `data/scripts/bake_map1919_tiles.py` 로 굽고
tiles 만 따로 올린다.
