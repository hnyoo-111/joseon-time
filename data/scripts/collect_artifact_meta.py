#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""유물 상세 뷰어용 메타데이터 표본 수집 (20건).

Sketchfab 모델 API 가 상세 뷰어에 필요한 것(한글명·해설·분류·썸네일)을
실제로 주는지, 인터넷 검색 없이 채울 수 있는지 표본으로 확인한다.

대상 선정은 189 서버에 **실제로 내려받혀 있는 폴더**만 고른다 —
/raw-asset/{folder}/scene.gltf 로 HEAD 를 쳐서 200 인 것만 표본에 넣는다.

토큰은 .env 에서 읽고 출력물에는 절대 쓰지 않는다.

사용:  python data/scripts/collect_artifact_meta.py
출력:  data/artifacts.meta.json (JOSEON_META_OUT 로 변경 가능)
"""

from __future__ import annotations

import io
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CATALOG = os.path.join(ROOT, "data", "assets.catalog.json")
CLASSIFICATION = os.path.join(ROOT, "data", "classification.json")
OUT = os.environ.get("JOSEON_META_OUT") or os.path.join(ROOT, "data", "artifacts.meta.json")

SERVER = os.environ.get("JOSEON_SERVER", "http://192.168.10.189:4001")
# 0 이면 서버에 있는 전량을 수집한다(카탈로그 506건을 모두 조회).
SAMPLE_SIZE = int(os.environ.get("JOSEON_SAMPLE_SIZE", "20")) or 10**9
# A13 실측 쿼터(15회/60초)를 지키는 페이싱. 20건이면 약 100초.
PACE_S = 5.0

# 설명문 앞머리의 KHS 정형 문구 — 유물 설명이 아니라 프로젝트 고지라서 걷어낸다.
BOILERPLATE = re.compile(
    r"\*\*These 3D assets were produced by Korea Heritage Service.*?source\.\s*",
    re.S,
)
HANGUL_NAME = re.compile(r"\*\*\*(.+?)\*\*\*")
SOURCE_LINE = re.compile(r"Explanation Source\s*:\s*(.+)")
HTML_TAG = re.compile(r"<[^>]+>")


try:  # Windows 콘솔 기본 코드페이지(cp949)에서 한글·em dash 가 깨진다.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def log(msg: str) -> None:
    sys.stdout.write(msg + "\n")
    sys.stdout.flush()


def read_token() -> str:
    path = os.path.join(ROOT, ".env")
    with io.open(path, encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("SKETCHFAB_TOKEN="):
                return line.split("=", 1)[1].strip()
    raise SystemExit(".env 에 SKETCHFAB_TOKEN 이 없다")


def load_json(path: str):
    with io.open(path, encoding="utf-8") as fh:
        return json.load(fh)


def on_server(folder: str) -> bool:
    """서버 raw/ 에 실물이 있는지 — 없는 폴더를 표본에 넣어도 뷰어에 못 띄운다.

    503(nginx 속도 제한)과 타임아웃은 '없음'이 아니라 '판정 불가'다. sync 가 도는 중이면
    서버가 바빠 이쪽이 자주 뜨는데, 재시도 없이 False 로 처리하면 보유 자산을 대량 누락한다.
    """
    url = "%s/raw-asset/%s/scene.gltf" % (SERVER, urllib.parse.quote(folder))
    for attempt in range(3):
        req = urllib.request.Request(url, method="HEAD")
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return r.status == 200
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return False
            if e.code != 503:
                return False
        except Exception:
            pass
        time.sleep(1.5 * (attempt + 1))
    return False


def fetch_model(uid: str, token: str) -> dict:
    req = urllib.request.Request(
        "https://api.sketchfab.com/v3/models/%s" % uid,
        headers={"Authorization": "Token %s" % token},
    )
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.load(r)


def parse_description(desc: str) -> dict:
    """KHS 설명문에서 한글명·본문·출처를 분리한다."""
    text = BOILERPLATE.sub("", desc or "")
    hangul = HANGUL_NAME.search(text)
    source = SOURCE_LINE.search(text)
    body = text
    if hangul:
        body = body[hangul.end():]
    if source:
        body = body[: body.index(source.group(0))]
    body = HTML_TAG.sub("", body)
    body = re.sub(r"\n{2,}", "\n", body).strip().strip('"').strip()
    return {
        "nameKo": hangul.group(1).strip() if hangul else None,
        "description": body or None,
        "descriptionSource": source.group(1).strip() if source else None,
    }


def main() -> None:
    token = read_token()
    catalog = {a["folder"]: a for a in load_json(CATALOG)["assets"]}
    klass = {a["folder"]: a for a in load_json(CLASSIFICATION)["assets"]}

    log("1) 서버 raw/ 에 실물이 있는 폴더 탐색 — %d건 채울 때까지" % SAMPLE_SIZE)
    # 알파벳 순서대로 뽑으면 업로드 배치(신라 유물 등)에 쏠려 대표성이 없다.
    # 시드를 고정한 무작위 순회로 카탈로그 전체에 고르게 걸친다.
    candidates = sorted(catalog)
    random.Random(20260813).shuffle(candidates)
    picked = []
    for folder in candidates:
        if len(picked) >= SAMPLE_SIZE:
            break
        if on_server(folder):
            picked.append(folder)
            log("   [%2d] %s" % (len(picked), folder))
    if not picked:
        raise SystemExit("서버에서 raw 에셋을 하나도 찾지 못했다 — SERVER 주소·배포 상태 확인")

    log("2) Sketchfab 메타데이터 수집 — %.0f초 페이싱" % PACE_S)
    records, failed = [], []
    for i, folder in enumerate(picked):
        uid = catalog[folder].get("sketchfabUid")
        if not uid:
            failed.append({"folder": folder, "reason": "카탈로그에 sketchfabUid 없음"})
            continue
        try:
            d = fetch_model(uid, token)
        except urllib.error.HTTPError as e:
            failed.append({"folder": folder, "reason": "HTTP %s" % e.code})
            log("   ! %s HTTP %s" % (folder, e.code))
            time.sleep(PACE_S)
            continue

        parsed = parse_description(d.get("description"))
        thumbs = sorted(
            (d.get("thumbnails") or {}).get("images", []),
            key=lambda im: im.get("width") or 0,
        )
        cls = klass.get(folder, {})
        records.append({
            "folder": folder,
            "sketchfabUid": uid,
            "nameEn": d.get("name"),
            "nameKo": parsed["nameKo"],
            "description": parsed["description"],
            "descriptionSource": parsed["descriptionSource"],
            "categories": [c.get("name") for c in (d.get("categories") or [])],
            "tags": [t.get("name") for t in (d.get("tags") or [])],
            "thumbnail": thumbs[-1]["url"] if thumbs else None,
            "thumbnailSmall": thumbs[0]["url"] if thumbs else None,
            "viewerUrl": d.get("viewerUrl"),
            "license": (d.get("license") or {}).get("label"),
            "faceCount": d.get("faceCount"),
            "class": cls.get("class"),
            "site": cls.get("site"),
        })
        log("   [%2d/%d] %s → %s" % (i + 1, len(picked), folder, parsed["nameKo"] or "(한글명 없음)"))
        if i < len(picked) - 1:
            time.sleep(PACE_S)

    filled = lambda key: sum(1 for r in records if r.get(key))
    report = {
        "generatedBy": "data/scripts/collect_artifact_meta.py",
        "purpose": "유물 상세 뷰어 메타데이터 충족도 표본 검증",
        "server": SERVER,
        "sampleSize": len(records),
        "coverage": {
            "nameKo": filled("nameKo"),
            "description": filled("description"),
            "thumbnail": filled("thumbnail"),
            "categories": sum(1 for r in records if r.get("categories")),
            "tags": sum(1 for r in records if r.get("tags")),
            "site": filled("site"),
        },
        "failed": failed,
        "artifacts": records,
    }
    with io.open(OUT, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(report, ensure_ascii=False, indent=1))
    log("3) 저장: %s" % os.path.relpath(OUT, ROOT))
    log("   충족도: %s" % json.dumps(report["coverage"], ensure_ascii=False))


if __name__ == "__main__":
    main()
