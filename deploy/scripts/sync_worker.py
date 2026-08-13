# -*- coding: utf-8 -*-
"""S1 동기화 워커 — 운영 아키텍처 §3의 6단계 사이클.

A13 실측으로 확정된 파라미터를 그대로 구현한다:
  - 목록 순회는 sort_by=-publishedAt 필수 (기본 커서는 불안정 오프셋 — 177건 누락됨)
  - Download API는 이동 60초 창 15회 쿼터 → 5초 페이싱
  - 목록 응답에 updatedAt이 없어 델타 지문 = gltf 아카이브 크기 + faceCount + vertexCount

기본은 dry-run(아무것도 내려받지 않고 판정만). 실제 반영은 --apply.
서버 배포 후 cron 주 1회 실행을 전제로 하되, 로컬에서도 동일하게 동작한다.
"""
import argparse
import hashlib
import io
import json
import os
import re
import sys
import time
import zipfile

import requests

API = "https://api.sketchfab.com/v3"
SOURCE_USER = "KHS_Asset"
LIST_PACE_S = 0.5
DOWNLOAD_PACE_S = 5.0  # A13: 15회/60초 쿼터 — 5초 간격이면 429 없음

# 서버(APP_ROOT=/srv/joseon-time)에서는 scripts/ 바로 위가 루트이고 원본은 raw/ 에 쌓인다.
# 로컬 저장소에서는 data/scripts/ 기준 3단계 위가 루트이고 원본은 heritage/asset/ 이다.
if os.environ.get("APP_ROOT"):
    ROOT = os.environ["APP_ROOT"]
    ASSET_ROOT = os.path.join(ROOT, "raw")
else:
    ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ASSET_ROOT = os.path.join(ROOT, "heritage", "asset")
DATA = os.path.join(ROOT, "data")
STATE_PATH = os.path.join(DATA, "sync-state.json")
PROVENANCE_PATH = os.path.join(DATA, "provenance.json")
QUARANTINE = os.path.join(DATA, "quarantine")
LOCK_PATH = os.path.join(DATA, "sync-worker.lock")


def load_token():
    token = os.environ.get("SKETCHFAB_TOKEN")
    if token:
        return token
    p = os.path.join(ROOT, ".env")
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("SKETCHFAB_TOKEN="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("SKETCHFAB_TOKEN not set (env or project-root .env)")


def load_json(path, default):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return default


def save_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def fingerprint(model):
    gltf = ((model.get("archives") or {}).get("gltf") or {})
    return {
        "gltfSize": gltf.get("size"),
        "faceCount": model.get("faceCount"),
        "vertexCount": model.get("vertexCount"),
    }


def walk_catalogue(session):
    url = f"{API}/models?user={SOURCE_USER}&count=24&sort_by=-publishedAt"
    models = {}
    pages = 0
    while url:
        r = session.get(url, timeout=30)
        r.raise_for_status()
        body = r.json()
        for m in body.get("results", []):
            models[m["uid"]] = {
                "name": m.get("name"),
                "isDownloadable": m.get("isDownloadable"),
                "publishedAt": m.get("publishedAt"),
                "license": (m.get("license") or {}).get("label"),
                "author": ((m.get("user") or {}).get("username")),
                "fingerprint": fingerprint(m),
            }
        url = body.get("next")
        pages += 1
        time.sleep(LIST_PACE_S)
    return models, pages


def safe_folder_name(name):
    name = re.sub(r"[^0-9A-Za-z가-힣_\-]+", "_", (name or "").strip()).strip("_")
    return name or "unnamed"


def download_one(session, uid, meta, dest_folder):
    """Download API → gltf 아카이브 수신 → 검증 → asset/{folder}/ 반영. 성공 시 sha256 반환."""
    r = session.get(f"{API}/models/{uid}/download", timeout=30)
    if r.status_code == 429:
        raise RuntimeError("rate-limited (429) — 쿼터 소진, 다음 주기에 재시도")
    r.raise_for_status()
    gltf = (r.json().get("gltf") or {})
    if not gltf.get("url"):
        raise RuntimeError("gltf archive not offered")
    blob = requests.get(gltf["url"], timeout=600).content  # 서명 URL — 인증 헤더 불필요
    digest = hashlib.sha256(blob).hexdigest()
    zf = zipfile.ZipFile(io.BytesIO(blob))
    names = zf.namelist()
    if "scene.gltf" not in names:
        raise RuntimeError(f"archive has no scene.gltf ({len(names)} entries)")
    target = os.path.join(ASSET_ROOT, dest_folder)
    os.makedirs(target, exist_ok=True)
    zf.extractall(target)
    return digest, len(blob)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="실제 다운로드·반영 (기본은 dry-run)")
    ap.add_argument("--limit", type=int, default=0, help="이번 주기 최대 다운로드 건수 (0=무제한)")
    args = ap.parse_args()

    if os.path.exists(LOCK_PATH):
        raise SystemExit("another run in progress (sync-worker.lock exists)")
    open(LOCK_PATH, "w").close()
    try:
        session = requests.Session()
        session.headers["Authorization"] = f"Token {load_token()}"

        catalog = load_json(os.path.join(DATA, "assets.catalog.json"), {})
        local_by_uid = {a["sketchfabUid"]: a["folder"] for a in catalog.get("assets", []) if a.get("sketchfabUid")}
        state = load_json(STATE_PATH, {"baseline": {}, "failed": {}})

        remote, pages = walk_catalogue(session)
        baseline = state["baseline"]

        def on_disk(uid):
            f = local_by_uid.get(uid)
            return bool(f) and os.path.exists(os.path.join(ASSET_ROOT, f, "scene.gltf"))

        # missing = 디스크에 실물이 없는 것. 카탈로그에 없는 신규(393건)와
        # 카탈로그에는 있으나 아직 안 받은 것(빈 raw/ 에서 시딩할 때의 506건)을 모두 포함한다.
        missing, changed, unchanged, not_downloadable = [], [], [], []
        for uid, m in remote.items():
            if not m["isDownloadable"]:
                not_downloadable.append(uid)
                continue
            if not on_disk(uid):
                missing.append(uid)
            elif uid in baseline and baseline[uid] != m["fingerprint"]:
                changed.append(uid)
            else:
                unchanged.append(uid)
        new = missing  # 이하 큐 구성에서 사용
        in_catalog = sum(1 for u in missing if u in local_by_uid)

        report = {
            "ranAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "mode": "apply" if args.apply else "dry-run",
            "remoteTotal": len(remote), "listPages": pages,
            "localMatched": len(local_by_uid),
            "missingOnDisk": len(missing),
            "missingInCatalog": in_catalog,          # 카탈로그에 있으나 아직 안 받은 것(시딩 대상)
            "missingNewToCatalog": len(missing) - in_catalog,  # 카탈로그에 없는 신규
            "changed": len(changed), "unchanged": len(unchanged),
            "notDownloadable": len(not_downloadable),
            "retryQueue": len(state["failed"]),
        }

        downloaded, failed = [], []
        if args.apply:
            os.makedirs(QUARANTINE, exist_ok=True)
            provenance = load_json(PROVENANCE_PATH, {"records": []})
            queue = [*changed, *new, *state["failed"].keys()]
            if args.limit:
                queue = queue[: args.limit]
            for uid in queue:
                m = remote.get(uid)
                if not m:
                    continue
                folder = local_by_uid.get(uid) or safe_folder_name(m["name"])
                try:
                    digest, size = download_one(session, uid, m, folder)
                    provenance["records"].append({
                        "uid": uid, "folder": folder, "sha256": digest, "bytes": size,
                        "author": m["author"], "license": m["license"],
                        "source": f"https://sketchfab.com/3d-models/{uid}",
                        "fetchedAt": report["ranAt"],
                    })
                    baseline[uid] = m["fingerprint"]
                    state["failed"].pop(uid, None)
                    downloaded.append(uid)
                except Exception as e:
                    state["failed"][uid] = {"error": str(e)[:200], "at": report["ranAt"]}
                    failed.append(uid)
                    if "429" in str(e):
                        break  # 쿼터 소진 — 나머지는 다음 주기
                time.sleep(DOWNLOAD_PACE_S)
            save_json(PROVENANCE_PATH, provenance)
        else:
            for uid, m in remote.items():  # dry-run도 다음 주기 델타를 위해 기준 지문은 기록
                baseline.setdefault(uid, m["fingerprint"])

        report["downloaded"] = len(downloaded)
        report["failedThisRun"] = len(failed)
        save_json(STATE_PATH, state)
        save_json(os.path.join(DATA, "sync-last-run.json"), report)
        print(json.dumps(report, ensure_ascii=False, indent=1))
    finally:
        os.remove(LOCK_PATH)


if __name__ == "__main__":
    main()
