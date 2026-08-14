#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""1919년 조선지형도(국사편찬위 한국근대지리정보 WMTS)를 행차 회랑만 잘라
웹메르카토르 XYZ 타일로 구워 자체 서빙한다.

왜 굽는가
  국편 WMTS 는 EPSG:5179 그리드만 제공한다. Cesium 은 지리/웹메르카토르 그리드만
  읽을 수 있어 직접 붙일 수 없다. 회랑 타일을 한 번 받아 재투영해 두면
  런타임 외부 의존 없이(대동여지도처럼) 우리 서버가 서빙한다.

[이용 조건 — 반드시 확인]
  원자료: 국사편찬위원회 한국근대지리정보(hgis.history.go.kr), 1:50,000 조선지형도(1919 기준).
  화면에 출처 표기를 넣었다. API 키는 해당 사이트 공개 페이지에 실린 값이므로
  운영 배포 전에 자체 키 발급(오픈API 신청)과 이용 약관 확인이 필요하다.

사용:  python data/scripts/bake_map1919_tiles.py
출력:  public/tiles/map1919/{z}/{x}/{y}.png (웹메르카토르, z9~14)
"""

from __future__ import annotations

import io
import math
import os
import sys
import time
import urllib.request

import numpy as np
from PIL import Image
from pyproj import Transformer

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC_DIR = os.path.join(ROOT, "tmp", "tiles1919_src")
OUT_DIR = os.path.join(ROOT, "public", "tiles", "map1919")

# -- 원본 WMTS (EPSG:5179 그리드) -------------------------------------------------
# API 키는 .env 의 HGIS_API_KEY 에서 읽는다(저장소에 박지 않는다). 국편 오픈API 로 발급받는다.
def _read_hgis_key() -> str:
    key = os.environ.get("HGIS_API_KEY")
    if not key:
        env_path = os.path.join(ROOT, ".env")
        if os.path.exists(env_path):
            for line in open(env_path, encoding="utf-8"):
                line = line.strip()
                if line.startswith("HGIS_API_KEY="):
                    key = line.split("=", 1)[1].strip()
                    break
    if not key:
        raise SystemExit("HGIS_API_KEY 가 없습니다 — .env 에 넣으세요 (국사편찬위 오픈API 키)")
    return key


API = ("https://hgis.history.go.kr/openapi/get.do"
       "?apiKey={apikey}"
       "&layer=history%3Amap1919&tilematrixset=EPSG%3A5179&Service=WMTS"
       "&Request=GetTile&Version=1.0.0&Format=image%2Fpng"
       "&TileMatrix=EPSG%3A5179%3A{z}&TileCol={col}&TileRow={row}")
# GetCapabilities 의 그리드 정의: TopLeftCorner (N 4,000,000 / E -200,000),
# 레벨 z 타일 한 변 = 0.00028 × ScaleDenominator × 256 (m).
E0, N0 = -200000.0, 4000000.0
SRC_LEVEL = 12
SPAN = 0.00028 * 13634.189375521559 * 256   # 레벨 12 타일 한 변(m) ≈ 977.3

# 회랑들 (EPSG:5179) — 여정 경로 bbox + 여유. 인자로 이름을 주면 그 회랑만 굽는다.
#   사용: python bake_map1919_tiles.py [seoul|yeongwol]
CORRIDORS = {
    "seoul": (944000, 961000, 1908000, 1959000),      # 화성행차: 서울~융릉
    "yeongwol": (1057000, 1093000, 1902000, 1926000), # 단종 유배길: 솔치재~청령포
}

# 출력 웹메르카토르 줌 — 원본이 1:50,000 스캔(약 4m/px)이라 z14 이상은 의미가 없다.
OUT_ZMIN, OUT_ZMAX = 9, 14
TILE = 256

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def src_tile_range(cor):
    ce0, ce1, cn0, cn1 = cor
    c0 = int((ce0 - E0) // SPAN)
    c1 = int((ce1 - E0) // SPAN)
    r0 = int((N0 - cn1) // SPAN)
    r1 = int((N0 - cn0) // SPAN)
    return c0, c1, r0, r1


def download_sources(cor):
    c0, c1, r0, r1 = src_tile_range(cor)
    total = (c1 - c0 + 1) * (r1 - r0 + 1)
    os.makedirs(SRC_DIR, exist_ok=True)
    n = have = 0
    for row in range(r0, r1 + 1):
        for col in range(c0, c1 + 1):
            n += 1
            path = os.path.join(SRC_DIR, "%d_%d.png" % (col, row))
            if os.path.exists(path):
                have += 1
                continue
            url = API.format(apikey=_read_hgis_key(), z=SRC_LEVEL, col=col, row=row)
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (joseon-time bake)"})
                data = urllib.request.urlopen(req, timeout=30).read()
                with open(path, "wb") as f:
                    f.write(data)
            except Exception as e:
                print("  실패 %d,%d: %s" % (col, row, e))
            if n % 100 == 0:
                print("  %d/%d ..." % (n, total), flush=True)
            time.sleep(0.05)  # 공공 서버 배려
    print("원본 타일: %d개 (기존 %d)" % (total, have))
    return c0, c1, r0, r1


def load_mosaic(c0, c1, r0, r1):
    w = (c1 - c0 + 1) * TILE
    h = (r1 - r0 + 1) * TILE
    mosaic = np.zeros((h, w, 4), dtype=np.uint8)
    for row in range(r0, r1 + 1):
        for col in range(c0, c1 + 1):
            path = os.path.join(SRC_DIR, "%d_%d.png" % (col, row))
            if not os.path.exists(path):
                continue
            try:
                im = Image.open(path).convert("RGBA")
            except Exception:
                continue
            y = (row - r0) * TILE
            x = (col - c0) * TILE
            mosaic[y:y + TILE, x:x + TILE] = np.asarray(im)
    print("모자이크: %dx%d" % (w, h))
    return mosaic


def bake(cor):
    c0, c1, r0, r1 = download_sources(cor)
    mosaic = load_mosaic(c0, c1, r0, r1)
    mh, mw = mosaic.shape[:2]
    # 모자이크 원점(좌상단)의 5179 좌표
    ME0 = E0 + c0 * SPAN
    MN0 = N0 - r0 * SPAN
    px = SPAN / TILE  # 원본 픽셀 크기(m)

    to5179 = Transformer.from_crs("EPSG:3857", "EPSG:5179", always_xy=True)
    to3857 = Transformer.from_crs("EPSG:5179", "EPSG:3857", always_xy=True)

    # 회랑의 3857 범위
    ce0, ce1, cn0, cn1 = cor
    xs, ys = to3857.transform([ce0, ce1], [cn0, cn1])
    X0, X1 = min(xs), max(xs)
    Y0, Y1 = min(ys), max(ys)
    WORLD = 20037508.342789244

    made = 0
    for z in range(OUT_ZMIN, OUT_ZMAX + 1):
        n = 2 ** z
        span = 2 * WORLD / n
        tx0 = int((X0 + WORLD) // span)
        tx1 = int((X1 + WORLD) // span)
        ty0 = int((WORLD - Y1) // span)
        ty1 = int((WORLD - Y0) // span)
        for ty in range(ty0, ty1 + 1):
            for tx in range(tx0, tx1 + 1):
                # 출력 타일의 픽셀 중심 3857 좌표 격자
                gx = -WORLD + (tx + (np.arange(TILE) + 0.5) / TILE) * span
                gy = WORLD - (ty + (np.arange(TILE) + 0.5) / TILE) * span
                mx, my = np.meshgrid(gx, gy)
                se, sn = to5179.transform(mx.ravel(), my.ravel())
                ix = np.round((np.asarray(se) - ME0) / px - 0.5).astype(np.int64)
                iy = np.round((MN0 - np.asarray(sn)) / px - 0.5).astype(np.int64)
                ok = (ix >= 0) & (ix < mw) & (iy >= 0) & (iy < mh)
                if not ok.any():
                    continue
                out = np.zeros((TILE * TILE, 4), dtype=np.uint8)
                out[ok] = mosaic[iy[ok], ix[ok]]
                img = out.reshape(TILE, TILE, 4)
                if not img[..., 3].any():
                    continue
                d = os.path.join(OUT_DIR, str(z), str(tx))
                os.makedirs(d, exist_ok=True)
                Image.fromarray(img, "RGBA").save(os.path.join(d, "%d.png" % ty), optimize=True)
                made += 1
        print("z%d 완료 (누적 %d타일)" % (z, made), flush=True)

    size = 0
    for root, _, files in os.walk(OUT_DIR):
        size += sum(os.path.getsize(os.path.join(root, f)) for f in files)
    print("저장: public/tiles/map1919 — %d타일, %.1f MB" % (made, size / 1048576))


def main():
    names = sys.argv[1:] or list(CORRIDORS)
    for name in names:
        print("== 회랑:", name)
        bake(CORRIDORS[name])


if __name__ == "__main__":
    main()
