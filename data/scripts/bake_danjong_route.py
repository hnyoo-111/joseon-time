#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""1457년 단종(노산군) 유배길 — **영월 구간**을 GeoJSON 으로 굳힌다.

범위
  전체 7일 노정(창덕궁→광나루→남한강 뱃길→이포→…)이 아니라, 영월군이 고증·조성한
  「단종유배길」 공식 코스(yw.go.kr cts788)와 정합되는 마지막 이틀
  (솔치재→주천→배일치→선돌→청령포)만 표출한다. 전체 노정 버전(수로 라우팅 포함)은
  git 히스토리(2026-08-14)에 있다.

노정의 출처 — 통설 기반 근사
  확정 기록(실록): 세조 3년 6월 22일 유배 출발, 6월 28일 청령포 도착(7일),
  첨지중추원사 어득해가 군졸 50명으로 호송. 세부 노정은 기록이 성기어
  영월군 「단종유배길」 코스 고증을 따른다.

경로 계산
  「근대 교통로 DB」 1914년 도로망(https://www.hisgeo.info/wiki/근대_교통로_DB)
  위 최단경로 — bake_haenghaeng_route.py 와 같은 방식.
  1457년의 실제 길 그 자체가 아니다 — 산출물과 화면에 근사임을 명시한다.

사용:  python data/scripts/bake_danjong_route.py
출력:  public/routes/danjong-yubae.geojson
"""

from __future__ import annotations

import heapq
import io
import json
import math
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "public", "routes", "danjong-yubae.geojson")

SOURCES = [
    os.path.join(ROOT, "data", "raw", "road_1914", "road_1914.geojson"),
]
CACHE = os.path.join(ROOT, "tmp", "road_1914_corridor_east.jsonl")

# 회랑 bbox (EPSG:5179) — 서울~영월
BBOX = (945000, 1100000, 1880000, 1970000)

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# 경유지 — 확실도 표기는 화성행차와 같은 규약.
#   verified : 현존 지점  /  approx : 터·통설 위치를 근사
#
# [범위] 전체 노정(창덕궁→광나루→뱃길→이포→…)이 아니라 **영월 「단종유배길」 공식 코스
# 구간(솔치재→주천→배일치→선돌→청령포)만** 표출한다 — 유배의 서사가 응축된 마지막
# 이틀(6월 27~28일)이고, 영월군이 고증·조성한 코스(yw.go.kr cts788)와 정합되는 구간이다.
# 서울부터의 전체 노정 버전은 git 히스토리(2026-08-14)에 있다.
WAYPOINTS = [
    # 솔치재 — 현대 터널(128.21557, 37.26568)이 아니라 1914 도로가 실제로 고개를 넘는
    # 지점에 핀을 둔다(터널 좌표로 두면 도로 밖이라 출발 도열이 산비탈로 뻗는다).
    {"id": "solchi", "name": "솔치재", "lon": 128.21699, "lat": 37.26748,
     "day": 1, "confidence": "approx",
     "note": "원주 신림에서 영월 주천으로 넘는 고개 — 유배길의 영월 들머리. 1914년 고갯길 위치로 근사"},
    {"id": "jucheon", "name": "주천(공순원)", "lon": 128.27120, "lat": 37.26450,
     "day": 1, "confidence": "approx", "note": "공순원 주막에서 마지막 밤을 보냈다는 통설"},
    # 배일치재 — 현대 터널(128.38807, 37.22752)이 아니라 1914 도로가 실제로 고개를 넘는
    # 지점에 핀을 둔다(터널 좌표로 두면 도로 밖이라 행렬이 1.5km 왕복 스퍼를 그린다).
    {"id": "baeilchi", "name": "배일치재", "lon": 128.38683, "lat": 37.21403,
     "day": 2, "confidence": "approx",
     "note": "단종이 서산에 지는 해를 향해 절했다는 고개. 1914년 고갯길 위치로 근사"},
    {"id": "seondol", "name": "선돌", "lon": 128.43306, "lat": 37.20572,
     "day": 2, "confidence": "verified", "note": "서강의 명승 — 유배길이 지나는 길목"},
    {"id": "cheongnyeongpo", "name": "청령포", "lon": 128.46930, "lat": 37.18630,
     "day": 2, "confidence": "verified", "note": "6월 28일 도착 — 삼면이 강, 한쪽은 절벽인 유배지"},
]

# 경로 유도점 — 핀은 찍지 않는다. 영월군 「단종유배길」 공식 코스도
# (yw.go.kr cts788, 솔치재→어음정→주천→금마→신천→배일치→선돌→방절삼거리→청령포)의
# 결절점을 따라가도록 붙든다. 좌표는 OSM 지오코딩(솔치터널·금마리·방절리 청령포육교).
CORRIDOR = {
    "bangjeol": {"lon": 128.44109, "lat": 37.18576}, # 방절삼거리(청령포 어귀)
}

# 구간 — 영월 구간만, 편도 이틀. 유배 6일차 오후 솔치재를 넘어 주천에서 유숙(공순원 통설),
# 7일차에 배일치·선돌을 지나 청령포에 든다.
LEGS = [
    # 금마 유도점은 뺐다 — 1914 도로에서 1.5km 떨어져 지그재그만 만들었고,
    # 주천→배일치 사이 강길이 어차피 공식 코스(금마·신천 경유) 축을 따른다.
    ("day1", 1, "솔치재 → 어음정 → 주천(공순원)", [("solchi", "jucheon")]),
    ("day2", 2, "주천 → 배일치 → 선돌 → 청령포",
     [("jucheon", "baeilchi"), ("baeilchi", "seondol"),
      ("seondol", "@bangjeol"), ("@bangjeol", "cheongnyeongpo")]),
]

# 실록 날짜(음력) — 유배 7일 중 마지막 이틀. 양력 환산은 단정하지 않고 화면에는 음력만 쓴다.
DAY_PLAN = [
    {"day": 1, "lunar": "6월 27일 (유배 6일차)", "label": "솔치재 → 주천(공순원)", "legId": "day1", "startHour": 13},
    {"day": 2, "lunar": "6월 28일 (유배 7일차)", "label": "주천 → 배일치 → 선돌 → 청령포", "legId": "day2", "startHour": 7},
]
BASE_DATE = "1457-07-06T00:00:00Z"  # 기준 시각(표출 1일차 00:00). 양력 환산 아님 — 표기는 음력만.

DISCLAIMER = (
    "유배 7일 노정 중 영월 「단종유배길」 공식 코스와 겹치는 마지막 구간"
    "(솔치재→주천→배일치→선돌→청령포)만 표현했습니다. 지도의 선은 1914년 도로망"
    "(근대 교통로 DB) 위에서 계산한 근사 경로입니다 — 1914년 지형도는 자동차 신작로 이전의 "
    "재래 도로망을 담은 가장 오래된 전국 실측 기록이지만, 1457년과는 457년의 격차가 있어 "
    "당시의 길 그 자체는 아닙니다. 경유지 다수가 터만 남아 근사 위치입니다."
)


# -- 공용: 그래프·다익스트라 (bake_haenghaeng_route.py 와 동일 방식) ------------------

def node_key(e, n):
    return (round(e), round(n))


def ensure_corridor() -> str:
    if os.path.exists(CACHE):
        return CACHE
    src = next((p for p in SOURCES if os.path.exists(p)), None)
    if not src:
        raise SystemExit("1914 도로망 원본을 찾을 수 없습니다: %s" % SOURCES)
    E0, E1, N0, N1 = BBOX
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    t0 = time.time()
    kept = 0
    with open(src, encoding="utf-8") as f, open(CACHE, "w", encoding="utf-8") as out:
        for line in f:
            if not line.startswith('{ "type": "Feature"'):
                continue
            i = line.find('"coordinates"')
            j = line.find("[", i)
            k = line.find("]", j)
            try:
                nums = line[j:k].strip("[ ").split(",")
                e, n = float(nums[0]), float(nums[1])
            except Exception:
                continue
            if E0 <= e <= E1 and N0 <= n <= N1:
                out.write(line.rstrip().rstrip(",") + "\n")
                kept += 1
    print("회랑 추출: %d 세그먼트, %.0f초" % (kept, time.time() - t0))
    return CACHE


def build_land_graph(cache):
    adj, geom = {}, {}
    for line in open(cache, encoding="utf-8"):
        try:
            f = json.loads(line)
        except Exception:
            continue
        length = f["properties"].get("length_3d") or 0.0
        for part in f["geometry"]["coordinates"]:
            a = node_key(part[0][0], part[0][1])
            b = node_key(part[-1][0], part[-1][1])
            if a == b:
                continue
            adj.setdefault(a, []).append((b, length))
            adj.setdefault(b, []).append((a, length))
            if (a, b) not in geom and (b, a) not in geom:
                geom[(a, b)] = [(c[0], c[1]) for c in part]
    return adj, geom


def dijkstra(adj, src, dst):
    dist = {src: 0.0}
    prev = {}
    pq = [(0.0, src)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == dst:
            break
        if d > dist.get(u, float("inf")):
            continue
        for v, w in adj[u]:
            nd = d + w
            if nd < dist.get(v, float("inf")):
                dist[v] = nd
                prev[v] = u
                heapq.heappush(pq, (nd, v))
    if dst not in dist:
        return None, None
    path = [dst]
    while path[-1] != src:
        path.append(prev[path[-1]])
    path.reverse()
    return dist[dst], path


def path_coords(geom, path):
    coords = []
    for u, v in zip(path, path[1:]):
        part = geom.get((u, v))
        if part is None:
            part = list(reversed(geom.get((v, u), [u, v])))
        if coords and coords[-1] == part[0]:
            coords.extend(part[1:])
        else:
            coords.extend(part)
    return coords


def nearest_node(nodes, pt):
    e, n = pt
    best, bd = None, float("inf")
    for nd in nodes:
        d = (nd[0] - e) ** 2 + (nd[1] - n) ** 2
        if d < bd:
            bd, best = d, nd
    return best, math.sqrt(bd)


# -- 굽기 ------------------------------------------------------------------------

def main():
    from pyproj import Transformer
    to5179 = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True)
    to4326 = Transformer.from_crs("EPSG:5179", "EPSG:4326", always_xy=True)

    cache = ensure_corridor()
    t0 = time.time()
    adj, geom = build_land_graph(cache)
    nodes = list(adj.keys())
    print("육로 그래프: %d 노드 (%.0f초)" % (len(nodes), time.time() - t0))

    by_id = {w["id"]: w for w in WAYPOINTS}

    snapped = {}

    def snap_land(name, lon, lat):
        if name in snapped:
            return snapped[name]
        pt = to5179.transform(lon, lat)
        nd, d = nearest_node(nodes, pt)
        snapped[name] = (nd, d, pt)
        print("  스냅(육) %-14s %5.0f m" % (name, d))
        return snapped[name]

    def land_route(pairs):
        """(id, id) 쌍들의 육로 — 경위도 좌표열과 거리(m)."""
        coords5179 = []
        meters = 0.0
        for na, nb in pairs:
            pa_w = CORRIDOR[na[1:]] if na.startswith("@") else by_id[na]
            pb_w = CORRIDOR[nb[1:]] if nb.startswith("@") else by_id[nb]
            src, da, pa = snap_land(na, pa_w["lon"], pa_w["lat"])
            dst, db, pb = snap_land(nb, pb_w["lon"], pb_w["lat"])
            d, path = dijkstra(adj, src, dst)
            if d is None:
                raise SystemExit("육로 경로 없음: %s -> %s" % (na, nb))
            seg = path_coords(geom, path)
            if da > 30 and not na.startswith("@"):
                seg = [pa] + seg
                meters += da
            if db > 30 and not nb.startswith("@"):
                seg = seg + [pb]
                meters += db
            meters += d
            if coords5179 and coords5179[-1] == seg[0]:
                coords5179.extend(seg[1:])
            else:
                coords5179.extend(seg)
        lonlats = [list(to4326.transform(e, n)) for e, n in coords5179]
        return [[round(a, 6), round(b, 6)] for a, b in lonlats], meters

    features = []

    def add_leg(leg_id, day, label, coords, meters, mode):
        features.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {
                "kind": "leg", "id": leg_id, "day": day, "label": label,
                "direction": "outbound", "mode": mode,
                "distanceKm": round(meters / 1000, 2), "pointCount": len(coords),
            },
        })
        print("  [%s] %-26s %6.2f km · %4d점 (%s)" % (leg_id, label, meters / 1000, len(coords), mode))

    # 영월 구간 육로
    for leg_id, day, label, pairs in LEGS:
        c, m = land_route(pairs)
        add_leg(leg_id, day, label, c, m, "land")

    for w in WAYPOINTS:
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [w["lon"], w["lat"]]},
            "properties": {k: v for k, v in w.items() if k not in ("lon", "lat")} | {"kind": "waypoint"},
        })

    total = sum(f["properties"]["distanceKm"] for f in features if f["properties"]["kind"] == "leg")
    doc = {
        "type": "FeatureCollection",
        "properties": {
            "generatedBy": "data/scripts/bake_danjong_route.py",
            "source": "근대 교통로 DB — 1914년 교통로 최단경로 · 수로: OpenStreetMap 하천 중심선(ODbL)",
            "sourceUrl": "https://www.hisgeo.info/wiki/근대_교통로_DB",
            "itinerarySource": "세조실록(출발·도착·호송) + 영월 단종유배길 통설 노정",
            "disclaimer": DISCLAIMER,
            "totalDistanceKm": round(total, 2),
            "baseDate": BASE_DATE,
            "dayPlan": DAY_PLAN,
        },
        "features": features,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with io.open(OUT, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(doc, ensure_ascii=False, indent=1))
    print("저장: %s (총 %.1f km, %.0f KB)"
          % (os.path.relpath(OUT, ROOT), total, os.path.getsize(OUT) / 1024))


if __name__ == "__main__":
    main()
