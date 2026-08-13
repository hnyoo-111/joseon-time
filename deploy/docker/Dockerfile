# 조선의 시간 — 통합 서버 이미지 (D-14: 수집·빌드·서빙 한 컨테이너)
FROM node:20-bookworm-slim

ARG KTX_VER=4.4.2
ENV APP_ROOT=/srv/joseon-time \
    DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      nginx curl ca-certificates python3 python3-requests tini \
 && curl -fsSL -o /tmp/ktx.deb \
      "https://github.com/KhronosGroup/KTX-Software/releases/download/v${KTX_VER}/KTX-Software-${KTX_VER}-Linux-x86_64.deb" \
 && (dpkg -i /tmp/ktx.deb || apt-get -f install -y) \
 && rm -rf /tmp/ktx.deb /var/lib/apt/lists/*

# gltf-transform + A5에서 확인된 sharp 이중 버전 충돌 해소(이거 없으면 resize 전면 실패)
RUN npm install -g @gltf-transform/cli@4.4.2 \
 && cd "$(npm root -g)/@gltf-transform/cli" && npm install sharp@0.35.3 --no-save

COPY scripts/ /srv/joseon-time/scripts/
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# nginx conf는 compose에서 마운트한다(인증서 경로·도메인 변경을 이미지 재빌드 없이 하려고)
RUN rm -f /etc/nginx/sites-enabled/default

EXPOSE 80 443
ENTRYPOINT ["/usr/bin/tini","--","/entrypoint.sh"]
CMD ["serve"]
