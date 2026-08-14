#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""1795년 을묘원행(정조 화성행차) 경로를 GeoJSON 으로 굳힌다.

경로의 출처 — 1914년 도로망 (근대 교통로 DB)
  data/raw/road_1914/road_1914.geojson (10m 세그먼트, EPSG:5179, 약 617만 개)은
  「근대 교통로 DB」(https://www.hisgeo.info/wiki/근대_교통로_DB)가 1914년
  조선총독부 지형도의 도로망을 디지타이즈한 것이다. 자동차 도로 개설 이전이라
  1795년 행차로(시흥로 축)와의 괴리가 현대 도로망(OSM)보다 훨씬 작다.
  예전에는 BRouter(OSM 도보)를 썼는데, 그건 현대 도로망 위의 근사였다.
  산출물과 화면에 출처를 반드시 표기한다.

동작
  1) 5.3GB 원본에서 서울~융릉 회랑(bbox)만 잘라 tmp/ 에 캐시한다(최초 1회, ~20초).
  2) 세그먼트 끝점을 1m 격자로 이어 그래프를 만들고, 경유지를 가장 가까운
     노드에 스냅해 다익스트라 최단경로를 구한다(가중치 = 실측 3D 길이).
  3) 스냅 거리가 큰 경유지(터 근사 지점)는 직선 연결선으로 핀까지 잇는다.

[중요] 역사적 정확성
  1914년 도로망이어도 1795년 행차로 그 자체는 아니다. 산출물의 properties.disclaimer 에
  이 사실을 박아 넣고, 화면에서도 반드시 근사 경로임을 노출해야 한다(JourneyStep.mock 규약).

사용:  python data/scripts/bake_haenghaeng_route.py
출력:  public/routes/hwaseong-haenghaeng.geojson
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
OUT = os.path.join(ROOT, "public", "routes", "hwaseong-haenghaeng.geojson")

# 원본 위치 — data/raw 로 옮기는 중이나, 잠겨 있으면 public/routes 의 옛 위치를 쓴다.
SOURCES = [
    os.path.join(ROOT, "data", "raw", "road_1914", "road_1914.geojson"),
    os.path.join(ROOT, "public", "routes", "road_1914.geojson"),
]
CACHE = os.path.join(ROOT, "tmp", "road_1914_corridor.jsonl")

# 회랑 bbox (EPSG:5179) — 서울 도심~융릉 남쪽, 여유 포함.
BBOX = (925000, 980000, 1885000, 1972000)  # E0, E1, N0, N1

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# 경유지 — 좌표 출처와 확실도를 항목마다 남긴다.
#   verified : 실측/지오코딩으로 현존 지점을 특정한 곳
#   approx   : 터만 남아 위치를 근사한 곳 (화면에 근사임을 표시해야 한다)
WAYPOINTS = [
    # 출발점은 궁 한가운데(인정전)로 둔다 — 1914 도로망에 궁 안 길은 없으므로
    # 인정전에서 돈화문 앞 길까지는 직선 연결선으로 이어진다(스냅 연결 규칙과 동일).
    {"id": "changdeok", "name": "창덕궁 인정전", "lon": 126.99110, "lat": 37.57920,
     "day": 1, "confidence": "verified", "note": "윤2월 9일 오전 7시 출발"},
    {"id": "baedari", "name": "한강 배다리", "lon": 126.95581, "lat": 37.51287,
     "day": 1, "confidence": "approx",
     "note": "배다리가 놓였던 노량진 도하 지점 근사"},
    # 용양봉저정은 현존 건물(동작구 본동, 한강대교 남단 서측) — 배다리와 같은 좌표로 두면
    # 라벨이 포개져서 실제 위치로 분리했다. 경유 순서상 도하 직후라 경로에는 영향 없다.
    {"id": "yongyang", "name": "용양봉저정", "lon": 126.95990, "lat": 37.51270,
     "day": 1, "confidence": "verified", "note": "도하 후 점심 수라"},
    {"id": "siheung", "name": "시흥행궁 터", "lon": 126.90792, "lat": 37.44965,
     "day": 1, "confidence": "approx",
     "note": "금천구 시흥동 은행나무 사거리 일대. 건물은 남아 있지 않아 터를 근사"},
    {"id": "sageuncham", "name": "사근참행궁 터", "lon": 126.97039, "lat": 37.34441,
     "day": 2, "confidence": "approx",
     "note": "의왕시 고천동 일대(현 의왕시청 인근). 터만 남아 근사"},
    {"id": "haenggung", "name": "화성행궁", "lon": 127.01371, "lat": 37.28184,
     "day": 2, "confidence": "verified", "note": "윤2월 10일 오후 도착, 4박"},
    {"id": "yungneung", "name": "현륭원(융릉)", "lon": 126.99386, "lat": 37.21165,
     "day": 4, "confidence": "verified", "note": "윤2월 12일 사도세자 묘소 참배"},
]

# 경로 유도점 — 지도에 핀으로 찍지 않는다. 기록에 남은 행차로 지점(만안교·지지대고개)을
# 지나가게 붙드는 용도다. 1914 도로망은 시흥로 축을 자연히 타지만, 명시해 두면 안전하다.
CORRIDOR = {
    "manan": {"lon": 126.91772, "lat": 37.40661},   # 안양 만안 — 만안교가 놓였던 구간
    "jijidae": {"lon": 126.99653, "lat": 37.30936}, # 수원 파장동 — 지지대고개 어귀
}

# 구간 정의 — 왕복이라 같은 길을 되짚는다. 8일 일정의 이동일만 경로를 만든다.
# direction: outbound(가는 길)·spur(참배 왕복)·inbound(환궁길).
# 환궁길은 가는 길과 같은 도로라 선을 겹쳐 그리면 두 줄로 보인다 — 지도에는 그리지 않고
# 행렬 이동에만 쓴다(렌더러가 direction 으로 판단).
LEGS = [
    {"id": "day1", "day": 1, "label": "창덕궁 → 시흥행궁", "direction": "outbound",
     "via": ["changdeok", "baedari", "@manan_skip", "siheung"]},
    {"id": "day2", "day": 2, "label": "시흥행궁 → 화성행궁", "direction": "outbound",
     "via": ["siheung", "@manan", "sageuncham", "@jijidae", "haenggung"]},
    # 4일차는 반드시 왕복이어야 한다 — 저녁 서장대 야조가 화성에서 열렸고,
    # 편도로 두면 행렬 시뮬레이션의 이어 붙인 경로가 융릉에서 끊겨
    # 7일차 아침에 융릉→화성 8km 허공 직선을 걷는 버그가 된다(2026-08-14 실측).
    {"id": "day4", "day": 4, "label": "화성행궁 → 현륭원 → 화성행궁 (참배 왕복)", "direction": "spur",
     "via": ["haenggung", "yungneung", "haenggung"]},
    {"id": "day7", "day": 7, "label": "화성행궁 → 시흥행궁 (환궁길)", "direction": "inbound",
     "via": ["haenggung", "@jijidae", "sageuncham", "@manan", "siheung"]},
    {"id": "day8", "day": 8, "label": "시흥행궁 → 창덕궁 (환궁)", "direction": "inbound",
     "via": ["siheung", "baedari", "changdeok"]},
]

# 8일 일정 — 앱이 geojson 의 dayPlan/baseDate 를 읽어 시뮬레이션 시간축을 만든다.
# (예전에는 haenghaengProcession.ts 에 하드코딩돼 있었다. 일정은 경로와 같은 자료이므로 여기로 옮겼다.)
DAY_PLAN = [
    {"day": 1, "lunar": "윤2월 9일", "label": "창덕궁 → 배다리 → 시흥행궁", "legId": "day1", "startHour": 7},
    {"day": 2, "lunar": "윤2월 10일", "label": "시흥행궁 → 사근참 → 화성행궁", "legId": "day2", "startHour": 7},
    {"day": 3, "lunar": "윤2월 11일", "label": "화성향교 알성 · 문무과 별시", "legId": None, "startHour": 9},
    {"day": 4, "lunar": "윤2월 12일", "label": "현륭원 참배 · 서장대 야조", "legId": "day4", "startHour": 8},
    {"day": 5, "lunar": "윤2월 13일", "label": "봉수당 진찬연 (회갑연)", "legId": None, "startHour": 10},
    {"day": 6, "lunar": "윤2월 14일", "label": "신풍루 사미(진휼) · 낙남헌 양로연", "legId": None, "startHour": 9},
    {"day": 7, "lunar": "윤2월 15일", "label": "화성행궁 → 시흥행궁", "legId": "day7", "startHour": 7},
    {"day": 8, "lunar": "윤2월 16일", "label": "시흥행궁 → 창덕궁 환궁", "legId": "day8", "startHour": 7},
]
BASE_DATE = "1795-03-29T00:00:00Z"  # 1일차 00:00 기준. 양력 환산 단정 없음 — 표기는 음력만.

DISCLAIMER = (
    "이 경로는 1914년 조선총독부 지형도 도로망 위에서 계산한 근사 경로입니다. "
    "1795년 당시의 실제 행차로 그 자체는 아닙니다. 경유지는 『원행을묘정리의궤』의 일정 기록을 따르되, "
    "행궁 터 등 일부 지점의 좌표는 현존하지 않아 근사 위치입니다."
)


# -- 1) 회랑 추출(캐시) ----------------------------------------------------------

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


# -- 2) 그래프 -------------------------------------------------------------------

def node_key(e: float, n: float):
    return (round(e), round(n))


def build_graph(cache: str):
    adj: dict = {}
    geom: dict = {}  # (a, b) -> 5179 좌표열 (a→b 방향)
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


def nearest_node(nodes, pt):
    e, n = pt
    best, bd = None, float("inf")
    for nd in nodes:
        d = (nd[0] - e) ** 2 + (nd[1] - n) ** 2
        if d < bd:
            bd, best = d, nd
    return best, math.sqrt(bd)


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
    """노드 경로 → 세그먼트 지오메트리를 이어 붙인 5179 좌표열."""
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


# -- 3) 굽기 --------------------------------------------------------------------

def main() -> None:
    from pyproj import Transformer
    to5179 = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True)
    to4326 = Transformer.from_crs("EPSG:5179", "EPSG:4326", always_xy=True)

    cache = ensure_corridor()
    t0 = time.time()
    adj, geom = build_graph(cache)
    nodes = list(adj.keys())
    print("그래프: %d 노드 (%.0f초)" % (len(nodes), time.time() - t0))

    by_id = {w["id"]: w for w in WAYPOINTS}

    # 경유지·유도점을 노드에 스냅. 스냅 거리는 로그로 남긴다(터 근사 지점은 수백 m 일 수 있다).
    snapped: dict = {}
    def snap(name: str, lon: float, lat: float):
        if name in snapped:
            return snapped[name]
        pt = to5179.transform(lon, lat)
        nd, d = nearest_node(nodes, pt)
        snapped[name] = (nd, d, pt)
        print("  스냅 %-12s %5.0f m" % (name, d))
        return snapped[name]

    features = []
    for leg in LEGS:
        refs = []
        for ref in leg["via"]:
            if ref.startswith("@"):
                key = ref[1:]
                if key in CORRIDOR:
                    refs.append((ref, CORRIDOR[key]["lon"], CORRIDOR[key]["lat"]))
                continue
            w = by_id[ref]
            refs.append((ref, w["lon"], w["lat"]))

        coords5179 = []
        meters = 0.0
        for (na, lon_a, lat_a), (nb, lon_b, lat_b) in zip(refs, refs[1:]):
            (src, da, pa) = snap(na, lon_a, lat_a)
            (dst, db, pb) = snap(nb, lon_b, lat_b)
            d, path = dijkstra(adj, src, dst)
            if d is None:
                raise SystemExit("경로 없음: %s -> %s" % (na, nb))
            seg = path_coords(geom, path)
            # 스냅 거리가 크면(터 근사 지점) 핀 좌표까지 직선으로 잇는다 — 선이 핀에 닿아야 한다.
            if da > 30:
                seg = [pa] + seg
                meters += da
            if db > 30:
                seg = seg + [pb]
                meters += db
            meters += d
            if coords5179 and coords5179[-1] == seg[0]:
                coords5179.extend(seg[1:])
            else:
                coords5179.extend(seg)

        lonlats = [list(to4326.transform(e, n)) for e, n in coords5179]
        lonlats = [[round(lon, 6), round(lat, 6)] for lon, lat in lonlats]
        features.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": lonlats},
            "properties": {
                "kind": "leg",
                "id": leg["id"],
                "day": leg["day"],
                "label": leg["label"],
                "direction": leg["direction"],
                "distanceKm": round(meters / 1000, 2),
                "pointCount": len(lonlats),
                "via": leg["via"],
            },
        })
        print("  [%s] %-28s %6.2f km · %4d점" % (leg["id"], leg["label"], meters / 1000, len(lonlats)))

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
            "generatedBy": "data/scripts/bake_haenghaeng_route.py",
            "source": "근대 교통로 DB — 1914년 교통로(도로_1914_10m_5179_20250831) 최단경로",
            "sourceUrl": "https://www.hisgeo.info/wiki/근대_교통로_DB",
            "itinerarySource": "원행을묘정리의궤 기반 8일 일정",
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
