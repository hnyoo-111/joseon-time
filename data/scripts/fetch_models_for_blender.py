#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""행렬 모델을 Blender 작업용으로 통째로 내려받는다.

189 서버의 raw 자산은 scene.gltf + scene.bin + textures/*.png 로 흩어져 있어
브라우저처럼 참조를 따라가며 받아야 Blender 에서 텍스처까지 열린다.

받은 뒤 각 모델의 크기·원점을 함께 출력한다 — 스캔 리메시라 스케일과 원점이
제각각이라서, Blender 에서 가장 먼저 손봐야 할 값이다.

사용:  python data/scripts/fetch_models_for_blender.py
출력:  tmp/work/models/{폴더}/scene.gltf (+ bin, textures)
"""

from __future__ import annotations

import io
import json
import os
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_ROOT = os.path.join(ROOT, "tmp", "work", "models")
BASE = os.environ.get("JOSEON_ASSET_BASE", "https://joseon-time.gaia3d.dev/raw-asset/")

# 행렬에 쓰는 모델 (haenghaengProcession.ts 의 DEFAULT_UNITS 와 같은 목록)
FOLDERS = [
    ("UijanggunCheongui Pirip", "의장군(청의, 피립)"),
    ("Flag", "깃발C"),
    ("GunyeongnoejaJujangsu", "군영뇌자(주장수)"),
    ("DanghagwanGunbok", "당하관(군복)"),
    ("Naechwi", "내취"),
    ("DanghagwanHeukdallyeong", "당하관(흑단령)"),
    ("HeukdallyeongHeongajipsaaksa", "흑단령(헌가집사악사)"),
]

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


# Cloudflare 가 기본 파이썬 User-Agent 를 403 으로 막는다. 브라우저 UA 를 붙인다.
HEADERS = {"User-Agent": "Mozilla/5.0 (joseon-time asset fetch)"}


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()


def download_model(folder: str, label: str) -> None:
    base = BASE + urllib.parse.quote(folder) + "/"
    dest = os.path.join(OUT_ROOT, folder)
    os.makedirs(os.path.join(dest, "textures"), exist_ok=True)

    raw = get(base + "scene.gltf")
    with open(os.path.join(dest, "scene.gltf"), "wb") as fh:
        fh.write(raw)
    gltf = json.loads(raw.decode("utf-8"))

    # 버퍼·텍스처를 참조대로 따라가며 받는다.
    refs = [b.get("uri") for b in gltf.get("buffers", [])]
    refs += [i.get("uri") for i in gltf.get("images", [])]
    total = 0
    for uri in [u for u in refs if u and not u.startswith("data:")]:
        data = get(base + urllib.parse.quote(uri))
        path = os.path.join(dest, uri.replace("/", os.sep))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(data)
        total += len(data)

    # 크기·원점 — Blender 에서 정규화할 때 필요한 값
    size = origin = None
    for a in gltf.get("accessors", []):
        if a.get("type") == "VEC3" and "min" in a and "max" in a:
            mn, mx = a["min"], a["max"]
            size = [round(mx[i] - mn[i], 2) for i in range(3)]
            origin = [round(v, 2) for v in mn]
            break

    faces = sum(
        len(p.get("attributes", {})) and 1 for m in gltf.get("meshes", []) for p in m.get("primitives", [])
    )
    print("  %-34s %-18s 메시%d · 크기%s · min%s · %.1fMB"
          % (folder, label, faces, size, origin, (len(raw) + total) / 1024 / 1024))


def main() -> None:
    os.makedirs(OUT_ROOT, exist_ok=True)
    print("행렬 모델 %d종을 내려받는다 → %s" % (len(FOLDERS), os.path.relpath(OUT_ROOT, ROOT)))
    for folder, label in FOLDERS:
        try:
            download_model(folder, label)
        except Exception as exc:
            print("  ! %s 실패: %s" % (folder, exc))
    print("완료. Blender 에서 각 폴더의 scene.gltf 를 import 하면 텍스처까지 함께 열린다.")


if __name__ == "__main__":
    main()
