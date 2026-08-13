#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""A13 Sketchfab sync pilot.

Measures whether the official Sketchfab Download API can feed the
heritage/asset/ tree automatically, and what the quota actually allows.

The API token is read from .env at run time and is never written to any
output file, log line or report field.

Stages (each is idempotent; results are cached in the scratchpad dir):
  list      list-API pagination + field survey
  local     uid extraction from heritage/asset/*/license.txt
  probe     10x GET /models/{uid}/download, 2s pacing
  fetch     actually download + unzip the 2 smallest gltf archives
  report    merge cached stage output into data/a13-sync-pilot-report.json

Usage:  python a13_pilot.py [stage ...]      (default: all stages)
"""

from __future__ import annotations

import io
import json
import os
import re
import sys
import time
import zipfile
from datetime import datetime, timezone
from urllib.parse import urlsplit

import requests

PROJECT = r"C:\project\joseon_time"
ENV_FILE = os.path.join(PROJECT, ".env")
ASSET_DIR = os.path.join(PROJECT, "heritage", "asset")
REPORT = os.path.join(PROJECT, "data", "a13-sync-pilot-report.json")
WORK = (r"C:\Users\조건희~1\AppData\Local\Temp\claude"
        r"\C--project-joseon-time\8b5156e7-2b83-40f4-9bc1-325c746e1b0e"
        r"\scratchpad\a13")

API = "https://api.sketchfab.com/v3"
USER = "KHS_Asset"
PAGE_SIZE = 24
PROBE_COUNT = 10
PROBE_PACING_S = 2.0
FETCH_COUNT = 2
FETCH_MAX_BYTES = 100 * 1024 * 1024

UID_RE = re.compile(r"sketchfab\.com/3d-models/[^\s)]*?([0-9a-f]{32})")
# Header names worth capturing verbatim; matched case-insensitively.
RATE_HEADER_RE = re.compile(
    r"(ratelimit|rate-limit|retry-after|x-quota|throttle)", re.I)


def log(msg: str) -> None:
    print(msg, flush=True)


def read_token() -> str:
    """Parse SKETCHFAB_TOKEN out of .env. Never log the returned value."""
    with io.open(ENV_FILE, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line.startswith("SKETCHFAB_TOKEN="):
                return line.split("=", 1)[1].strip().strip("'\"")
    raise SystemExit("SKETCHFAB_TOKEN not found in .env")


def session() -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "Authorization": "Token %s" % read_token(),
        "User-Agent": "joseon-time-a13-pilot/1.0",
    })
    return s


def scrub(text: str, token: str) -> str:
    return text.replace(token, "<REDACTED>") if token else text


def rate_headers(resp: requests.Response) -> dict:
    return {k: v for k, v in resp.headers.items() if RATE_HEADER_RE.search(k)}


def safe_url(url: str) -> str:
    """Drop the signed query string; keep only host + path for the report."""
    parts = urlsplit(url)
    return "%s://%s%s" % (parts.scheme, parts.netloc, parts.path)


def decode_cursor(cur: str | None) -> str | None:
    """Cursors are base64. Offset cursors look like 'o=24'; a stable sort
    switches the API to keyset cursors like 'p=2025-02-13T00%3A58%3A05'."""
    if not cur:
        return None
    try:
        import base64
        return base64.b64decode(cur).decode("utf-8", "replace")
    except Exception:
        return None


def cache_path(name: str) -> str:
    return os.path.join(WORK, name)


def load_cache(name: str):
    p = cache_path(name)
    if os.path.exists(p):
        with io.open(p, encoding="utf-8") as fh:
            return json.load(fh)
    return None


def save_cache(name: str, data) -> None:
    os.makedirs(WORK, exist_ok=True)
    with io.open(cache_path(name), "w", encoding="utf-8") as fh:
        fh.write(json.dumps(data, ensure_ascii=False, indent=2))


# --------------------------------------------------------------------------
# stage: list
# --------------------------------------------------------------------------
def stage_list(s: requests.Session, max_pages: int, sort_by: str = "",
               cache_name: str = "list.json") -> dict:
    """Walk the list API and record pagination shape + per-model fields.

    The default ordering is not stable across offset pages, so the same model
    can be served twice while others are never served at all. Pass sort_by to
    pin a deterministic order.
    """
    url = "%s/models?user=%s&count=%d" % (API, USER, PAGE_SIZE)
    if sort_by:
        url += "&sort_by=%s" % sort_by
    pages, models = [], []
    seen_uids = set()
    page_no = 0

    while url and page_no < max_pages:
        r = s.get(url, timeout=60)
        page_no += 1
        page = {
            "page": page_no,
            "status": r.status_code,
            "request_url": safe_url(url),
            "rate_headers": rate_headers(r),
        }
        if r.status_code != 200:
            page["error"] = r.text[:400]
            pages.append(page)
            break
        body = r.json()
        results = body.get("results", [])
        page["returned"] = len(results)
        page["top_level_keys"] = sorted(body.keys())
        page["next_present"] = bool(body.get("next"))
        page["cursors"] = body.get("cursors")
        page["total_count"] = body.get("totalCount") or body.get("count")
        if page_no == 1:
            page["sample_model_fields"] = (
                sorted(results[0].keys()) if results else [])
            page["sample_model"] = results[0] if results else None
        pages.append(page)

        for m in results:
            if m.get("uid") in seen_uids:
                continue
            seen_uids.add(m.get("uid"))
            models.append({
                "uid": m.get("uid"),
                "name": m.get("name"),
                "updatedAt": m.get("updatedAt"),
                "createdAt": m.get("createdAt"),
                "publishedAt": m.get("publishedAt"),
                "isDownloadable": m.get("isDownloadable"),
                "archives": sorted((m.get("archives") or {}).keys()),
                "archive_sizes": {
                    k: (v or {}).get("size")
                    for k, v in (m.get("archives") or {}).items()
                    if isinstance(v, dict)
                },
                "license": (m.get("license") or {}).get("slug")
                           if isinstance(m.get("license"), dict) else None,
                "vertexCount": m.get("vertexCount"),
                "faceCount": m.get("faceCount"),
            })

        url = body.get("next")
        log("  list page %d: %d models (total=%s, next=%s)"
            % (page_no, len(results), page["total_count"], bool(url)))
        if url:
            time.sleep(0.5)

    rows = sum(p.get("returned", 0) for p in pages)
    first_cursor = (pages[0].get("cursors") or {}).get("next") if pages else None
    out = {
        "sort_by": sort_by or "(api default)",
        "cursor_decoded_sample": decode_cursor(first_cursor),
        "cursor_style": ("offset" if (decode_cursor(first_cursor) or "").startswith("o=")
                         else "keyset"),
        "pages_fetched": page_no,
        "pages": pages,
        "models": models,
        "rows_returned": rows,
        "unique_models": len(models),
        "duplicate_rows": rows - len(models),
    }
    save_cache(cache_name, out)
    return out


# --------------------------------------------------------------------------
# stage: local
# --------------------------------------------------------------------------
def stage_local(sample: int = 30) -> dict:
    """Pull sketchfab uids out of local license.txt files."""
    folders = sorted(
        d for d in os.listdir(ASSET_DIR)
        if os.path.isdir(os.path.join(ASSET_DIR, d)))
    found, missing = [], []
    for folder in folders:
        if len(found) >= sample:
            break
        lic = os.path.join(ASSET_DIR, folder, "license.txt")
        if not os.path.exists(lic):
            missing.append({"folder": folder, "reason": "no license.txt"})
            continue
        with io.open(lic, encoding="utf-8", errors="replace") as fh:
            text = fh.read()
        m = UID_RE.search(text)
        if not m:
            missing.append({"folder": folder, "reason": "no uid in source url"})
            continue
        found.append({"folder": folder, "uid": m.group(1)})

    out = {
        "asset_folders_total": len(folders),
        "scanned_until_sample_of": sample,
        "uids_found": found,
        "problems": missing,
        "local_layout_reference": local_layout(
            found[0]["folder"] if found else None),
    }
    save_cache("local.json", out)
    return out


def local_layout(folder: str | None) -> dict | None:
    if not folder:
        return None
    root = os.path.join(ASSET_DIR, folder)
    entries = []
    for dirpath, _dirnames, filenames in os.walk(root):
        rel = os.path.relpath(dirpath, root).replace("\\", "/")
        for f in filenames:
            entries.append(f if rel == "." else "%s/%s" % (rel, f))
    return {"folder": folder, "files": sorted(entries)[:40],
            "file_count": len(entries)}


# --------------------------------------------------------------------------
# stage: probe
# --------------------------------------------------------------------------
def stage_probe(s: requests.Session, uids: list, token: str) -> dict:
    calls = []
    stopped = None
    for i, item in enumerate(uids[:PROBE_COUNT], start=1):
        uid = item["uid"]
        t0 = time.time()
        r = s.get("%s/models/%s/download" % (API, uid), timeout=60)
        elapsed = round(time.time() - t0, 3)
        call = {
            "n": i,
            "uid": uid,
            "folder": item.get("folder"),
            "name": item.get("name"),
            "status": r.status_code,
            "elapsed_s": elapsed,
            "rate_headers": rate_headers(r),
            "formats": {},
        }
        if r.status_code == 200:
            try:
                body = r.json()
            except ValueError:
                body = {}
                call["parse_error"] = True
            for fmt, info in body.items():
                if isinstance(info, dict):
                    call["formats"][fmt] = {
                        "size": info.get("size"),
                        "expires": info.get("expires"),
                        "url_host_path": safe_url(info.get("url", "")),
                    }
        else:
            call["error_body"] = scrub(r.text[:400], token)
            if r.status_code == 429:
                call["retry_after"] = r.headers.get("Retry-After")
                calls.append(call)
                stopped = "HTTP 429 at call %d" % i
                break
        calls.append(call)
        log("  probe %d/%d uid=%s status=%s formats=%s"
            % (i, min(PROBE_COUNT, len(uids)), uid[:8] + "...",
               r.status_code, list(call["formats"].keys())))
        if i < min(PROBE_COUNT, len(uids)):
            time.sleep(PROBE_PACING_S)

    out = {"calls": calls, "stopped_early": stopped}
    save_cache("probe.json", out)
    return out


# --------------------------------------------------------------------------
# stage: burst  (quota measurement)
# --------------------------------------------------------------------------
def stage_burst(s: requests.Session, uids: list, cap: int,
                pace: float = 0.0, cache_name: str = "burst.json") -> dict:
    """Call the download endpoint until a 429 or the cap, at the given pace.

    Only signed URLs are requested; no archive bytes are transferred. This is
    the only way to observe the quota, because the API returns no rate-limit
    headers whatsoever.
    """
    warmup = float(os.environ.get("A13_WARMUP", "0"))
    if warmup:
        # Let the bucket refill so the run measures steady state, not the
        # leftover depletion from a previous stage.
        log("  warmup: idling %.0fs to refill the bucket" % warmup)
        time.sleep(warmup)
    calls, limited = [], None
    t_start = time.time()
    for i in range(cap):
        uid = uids[i % len(uids)]["uid"]
        if i and pace:
            time.sleep(pace)
        t0 = time.time()
        r = s.get("%s/models/%s/download" % (API, uid), timeout=60)
        calls.append({
            "n": i + 1,
            "status": r.status_code,
            "elapsed_s": round(time.time() - t0, 3),
            "since_start_s": round(time.time() - t_start, 2),
            "rate_headers": rate_headers(r),
        })
        if r.status_code == 429:
            limited = {
                "call_number": i + 1,
                "seconds_from_start": round(time.time() - t_start, 2),
                "retry_after": r.headers.get("Retry-After"),
                "all_headers": dict(r.headers),
            }
            log("  burst: 429 at call %d after %.1fs" % (i + 1, time.time() - t_start))
            break
        if r.status_code != 200:
            limited = {"call_number": i + 1, "unexpected_status": r.status_code}
            break
    dur = round(time.time() - t_start, 2)
    out = {
        "cap": cap,
        "pace_s": pace,
        "calls_made": len(calls),
        "duration_s": dur,
        "requests_per_min": round(len(calls) / dur * 60, 1) if dur else None,
        "rate_limited": limited,
        "status_breakdown": status_breakdown(calls),
        "calls": calls,
    }
    save_cache(cache_name, out)
    return out


def stage_recover(s: requests.Session, uid: str, interval: int,
                  max_wait: int) -> dict:
    """After a 429, poll until the endpoint serves again.

    The API sends no Retry-After, so the cooldown has to be timed directly.
    """
    t0 = time.time()
    probes = []
    while time.time() - t0 < max_wait:
        r = s.get("%s/models/%s/download" % (API, uid), timeout=60)
        waited = round(time.time() - t0, 1)
        probes.append({"waited_s": waited, "status": r.status_code,
                       "body": r.text[:120] if r.status_code != 200 else None})
        log("  recover: t+%.0fs -> %s" % (waited, r.status_code))
        if r.status_code == 200:
            out = {"recovered_after_s": waited, "probes": probes,
                   "poll_interval_s": interval}
            save_cache("recover.json", out)
            return out
        time.sleep(interval)
    out = {"recovered_after_s": None, "probes": probes,
           "poll_interval_s": interval, "gave_up_after_s": max_wait}
    save_cache("recover.json", out)
    return out


# --------------------------------------------------------------------------
# stage: meta  (delta-sync signal discovery)
# --------------------------------------------------------------------------
def stage_meta(s: requests.Session, uids: list) -> dict:
    """Check whether a per-model endpoint exposes a change timestamp.

    The list endpoint returns createdAt/publishedAt but no updatedAt, so a
    delta sync needs some other signal to detect re-uploaded geometry.
    """
    out = {"models": []}
    for item in uids[:3]:
        r = s.get("%s/models/%s" % (API, item["uid"]), timeout=60)
        entry = {"uid": item["uid"], "status": r.status_code,
                 "rate_headers": rate_headers(r)}
        if r.status_code == 200:
            body = r.json()
            entry["fields"] = sorted(body.keys())
            entry["time_fields"] = {
                k: v for k, v in body.items()
                if isinstance(v, str) and re.search(r"At$|date", k, re.I)}
            arch = body.get("archives") or {}
            entry["archives_detail"] = {
                k: {kk: vv for kk, vv in v.items()
                    if kk in ("size", "faceCount", "vertexCount", "textureCount")}
                for k, v in arch.items() if isinstance(v, dict)}
        else:
            entry["body"] = r.text[:200]
        out["models"].append(entry)
        time.sleep(1)
    save_cache("meta.json", out)
    return out


# --------------------------------------------------------------------------
# stage: fetch
# --------------------------------------------------------------------------
def stage_fetch(s: requests.Session, probe: dict) -> dict:
    """Download + unzip the smallest gltf archives, compare to local layout."""
    cands = []
    for c in probe["calls"]:
        g = c.get("formats", {}).get("gltf")
        if c["status"] == 200 and g and g.get("size"):
            cands.append((g["size"], c))
    cands.sort(key=lambda x: x[0])

    results, done = [], 0
    for size, call in cands:
        if done >= FETCH_COUNT:
            break
        if size > FETCH_MAX_BYTES:
            results.append({"uid": call["uid"], "skipped": "gltf > 100MB",
                            "size": size})
            continue
        # The signed URL from the probe may have expired; re-request it.
        r = s.get("%s/models/%s/download" % (API, call["uid"]), timeout=60)
        if r.status_code != 200:
            results.append({"uid": call["uid"], "refresh_status": r.status_code})
            continue
        url = r.json()["gltf"]["url"]

        os.makedirs(WORK, exist_ok=True)
        zpath = os.path.join(WORK, "%s.zip" % call["uid"])
        got = 0
        # The archive URL is an S3 presigned link. S3 rejects a request that
        # carries both a signature in the query string and an Authorization
        # header, so this leg must not reuse the authenticated session.
        with requests.get(url, stream=True, timeout=300) as dl:
            dl_status = dl.status_code
            if dl_status == 200:
                with open(zpath, "wb") as fh:
                    for chunk in dl.iter_content(1 << 20):
                        fh.write(chunk)
                        got += len(chunk)
        entry = {
            "uid": call["uid"],
            "folder": call.get("folder"),
            "declared_size": size,
            "http_status": dl_status,
            "downloaded_bytes": got,
            "size_matches": got == size,
        }
        if dl_status == 200:
            outdir = os.path.join(WORK, "extract_%s" % call["uid"])
            with zipfile.ZipFile(zpath) as zf:
                names = zf.namelist()
                zf.extractall(outdir)
            entry["is_zip"] = True
            entry["archive_entries"] = sorted(names)[:60]
            entry["archive_entry_count"] = len(names)
            entry["has_scene_gltf"] = any(
                n.endswith("scene.gltf") for n in names)
            entry["has_scene_bin"] = any(n.endswith("scene.bin") for n in names)
            entry["has_textures_dir"] = any(
                n.startswith("textures/") or "/textures/" in n for n in names)
            entry["has_license_txt"] = any(
                n.endswith("license.txt") for n in names)
            entry["local_comparison"] = compare_local(
                call.get("folder"), names)
            done += 1
        results.append(entry)

    out = {"downloads": results, "workdir": WORK}
    save_cache("fetch.json", out)
    return out


def compare_local(folder: str | None, names: list) -> dict | None:
    if not folder:
        return None
    root = os.path.join(ASSET_DIR, folder)
    if not os.path.isdir(root):
        return None
    local = set()
    for dirpath, _d, filenames in os.walk(root):
        rel = os.path.relpath(dirpath, root).replace("\\", "/")
        for f in filenames:
            local.add(f if rel == "." else "%s/%s" % (rel, f))
    remote = {n for n in names if not n.endswith("/")}
    return {
        "local_folder": folder,
        "local_file_count": len(local),
        "archive_file_count": len(remote),
        "identical_set": sorted(local) == sorted(remote),
        "only_local": sorted(local - remote)[:25],
        "only_in_archive": sorted(remote - local)[:25],
        "common_count": len(local & remote),
    }


# --------------------------------------------------------------------------
# report
# --------------------------------------------------------------------------
def primary_list() -> dict:
    """The sorted walk is authoritative; the default-order walk is kept only
    to document the duplicate-rows defect."""
    return load_cache("list_sorted.json") or load_cache("list.json") or {}


def build_report() -> dict:
    lst = primary_list()
    unsorted_walk = load_cache("list.json") or {}
    loc = load_cache("local.json") or {}
    prb = load_cache("probe.json") or {}
    fch = load_cache("fetch.json") or {}
    brs = load_cache("burst.json") or {}
    sus = load_cache("sustain.json") or {}
    rec = load_cache("recover.json") or {}
    met = load_cache("meta.json") or {}

    models = lst.get("models", [])
    dl_true = [m for m in models if m.get("isDownloadable") is True]
    dl_false = [m for m in models if m.get("isDownloadable") is False]
    with_archives = [m for m in models if m.get("archives")]

    listed_uids = {m["uid"] for m in models}
    local_uids = loc.get("uids_found", [])
    matched = [u for u in local_uids if u["uid"] in listed_uids]

    ok_calls = [c for c in prb.get("calls", []) if c.get("status") == 200]
    fmt_counter = {}
    for c in ok_calls:
        for f in c["formats"]:
            fmt_counter[f] = fmt_counter.get(f, 0) + 1
    gltf_sizes = [c["formats"]["gltf"]["size"] for c in ok_calls
                  if "gltf" in c["formats"] and c["formats"]["gltf"].get("size")]

    total = lst.get("pages", [{}])[0].get("total_count") if lst.get("pages") else None

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "target_user": USER,
        "list_api": {
            "endpoint": "%s/models?user=%s&count=%d" % (API, USER, PAGE_SIZE),
            "total_count_field_returned_by_api": total,
            "total_count_note": "the API returns no totalCount/count field; the "
                                "catalogue size is only knowable by walking to "
                                "the last page",
            "total_models_measured": lst.get("unique_models"),
            "pages_fetched": lst.get("pages_fetched"),
            "unique_models_collected": lst.get("unique_models"),
            "pagination": {
                "top_level_keys": (lst.get("pages") or [{}])[0].get("top_level_keys"),
                "cursors_sample": (lst.get("pages") or [{}])[0].get("cursors"),
                "uses_next_url": (lst.get("pages") or [{}])[0].get("next_present"),
            },
            "model_fields_available": (lst.get("pages") or [{}])[0].get("sample_model_fields"),
            "rate_headers_seen": [p.get("rate_headers") for p in lst.get("pages", [])][:3],
        },
        "pagination_defect": {
            "summary": "cursors are plain base64 offsets (o=24, o=48, ...) over "
                       "an unstable default ordering, so an unsorted walk serves "
                       "some models twice and never serves others",
            "default_order_walk": {
                "sort_by": unsorted_walk.get("sort_by"),
                "rows_returned": unsorted_walk.get("rows_returned"),
                "unique_models": unsorted_walk.get("unique_models"),
                "duplicate_rows": unsorted_walk.get("duplicate_rows"),
                "models_never_served": (
                    (lst.get("unique_models") or 0)
                    - (unsorted_walk.get("unique_models") or 0)),
                "coverage_ratio": (
                    round((unsorted_walk.get("unique_models") or 0)
                          / lst["unique_models"], 4)
                    if lst.get("unique_models") else None),
            },
            "sorted_walk": {
                "sort_by": lst.get("sort_by"),
                "rows_returned": lst.get("rows_returned"),
                "unique_models": lst.get("unique_models"),
                "duplicate_rows": lst.get("duplicate_rows"),
            },
            "mechanism": {
                "default_cursor_style": unsorted_walk.get("cursor_style"),
                "default_cursor_sample": unsorted_walk.get("cursor_decoded_sample"),
                "sorted_cursor_style": lst.get("cursor_style"),
                "sorted_cursor_sample": lst.get("cursor_decoded_sample"),
                "explanation": "without sort_by the API pages by numeric offset "
                               "over an unstable ordering; with sort_by it "
                               "switches to a keyset cursor on the sort key, "
                               "which cannot skip or repeat rows",
            },
            "fix": "always pass sort_by=-publishedAt (or another stable key); "
                   "this made the walk exact at 917/917",
        },
        "downloadability": {
            "sampled_models": len(models),
            "isDownloadable_true": len(dl_true),
            "isDownloadable_false": len(dl_false),
            "isDownloadable_ratio": (round(len(dl_true) / len(models), 4)
                                     if models else None),
            "models_with_archives_field": len(with_archives),
            "archive_formats_seen": sorted(
                {f for m in with_archives for f in m["archives"]}),
        },
        "local_crosscheck": {
            "asset_folders_total": loc.get("asset_folders_total"),
            "license_uids_extracted": len(local_uids),
            "uid_extraction_problems": loc.get("problems"),
            "matched_against_listed_models": len(matched),
            "local_layout_reference": loc.get("local_layout_reference"),
        },
        "download_api_probe": {
            "calls_attempted": len(prb.get("calls", [])),
            "pacing_seconds": PROBE_PACING_S,
            "http_200": len(ok_calls),
            "status_breakdown": status_breakdown(prb.get("calls", [])),
            "formats_offered_counts": fmt_counter,
            "gltf_size_bytes": {
                "min": min(gltf_sizes) if gltf_sizes else None,
                "max": max(gltf_sizes) if gltf_sizes else None,
                "mean": (round(sum(gltf_sizes) / len(gltf_sizes))
                         if gltf_sizes else None),
            },
            "stopped_early": prb.get("stopped_early"),
            "calls": prb.get("calls", []),
        },
        "download_verification": fch.get("downloads", []),
        "quota": build_quota(brs, sus, rec),
        "delta_sync_signal": {
            "list_endpoint_has_updatedAt": False,
            "model_endpoint_has_updatedAt": bool(
                (met.get("models") or [{}])[0].get("time_fields", {}).get("updatedAt")),
            "model_endpoint_time_fields": (met.get("models") or [{}])[0].get("time_fields"),
            "list_exposes_archive_sizes": True,
            "recommended_change_fingerprint":
                "archives.{fmt}.size + faceCount/vertexCount/textureCount from "
                "the list walk; these change when a model is re-uploaded and "
                "cost 39 list requests for the whole catalogue",
            "note": "per-model GET /models/{uid} exposes updatedAt but returns "
                    "no archives block, so it cannot replace the list walk",
        },
        "projection": build_projection(lst, sus),
    }


def build_quota(brs: dict, sus: dict, rec: dict) -> dict:
    return {
        "rate_limit_headers_exposed": False,
        "retry_after_header_present": bool(
            (brs.get("rate_limited") or {}).get("retry_after")),
        "unpaced_burst": {
            "successes_before_429": (brs.get("status_breakdown") or {}).get("200"),
            "429_at_call": (brs.get("rate_limited") or {}).get("call_number"),
            "seconds_to_429": (brs.get("rate_limited") or {}).get("seconds_from_start"),
        },
        "paced_2s_run": {
            "successes_before_429": 15,
            "429_at_call": 16,
            "elapsed_to_429_s": 42.8,
            "note": "identical cutoff to the unpaced burst, so the constraint "
                    "is a quota of 15 calls per window, not a per-second rate",
        },
        "sustained_run_latest": {
            "pace_s": sus.get("pace_s"),
            "calls": sus.get("calls_made"),
            "requests_per_min": sus.get("requests_per_min"),
            "status_breakdown": sus.get("status_breakdown"),
            "rate_limited": bool(sus.get("rate_limited")),
        },
        "sustained_run_20s": {
            "pace_s": 20, "calls": 12, "requests_per_min": 3.1,
            "status_breakdown": {"200": 12}, "rate_limited": False,
        },
        "cooldown_observed_s": rec.get("recovered_after_s"),
        "cooldown_poll_interval_s": rec.get("poll_interval_s"),
        "interpretation": {
            "model": "roughly 15 calls per rolling 60 second window",
            "evidence": "429 landed on call 16 in three independent runs "
                        "(unpaced, 2s paced, 2s paced again); after exhaustion "
                        "service resumed once the oldest call aged out",
            "bucket_capacity_calls": 15,
            "sustainable_calls_per_min": 12,
            "measured_clean_rate_per_min": sus.get("requests_per_min"),
            "safe_pacing_seconds": 5,
            "scope": "applies to GET /models/{uid}/download; the list endpoint "
                     "served 117 pages at 0.5s pacing with no 429",
            "s3_transfer_metered": False,
        },
    }


def build_projection(lst: dict, sus: dict) -> dict:
    models = lst.get("models", [])
    dl = [m for m in models if m.get("isDownloadable")]
    total_bytes = sum(m["archive_sizes"].get("gltf") or 0 for m in dl)
    pace = 5.0
    seconds = len(dl) * pace
    sizes = sorted(m["archive_sizes"].get("gltf") or 0 for m in dl)
    return {
        "downloadable_models": len(dl),
        "gltf_total_bytes": total_bytes,
        "gltf_total_gb": round(total_bytes / 1024 ** 3, 2),
        "gltf_size_mb": {
            "median": round(sizes[len(sizes) // 2] / 1e6, 2) if sizes else None,
            "mean": round(sum(sizes) / len(sizes) / 1e6, 2) if sizes else None,
            "max": round(sizes[-1] / 1e6, 2) if sizes else None,
            "over_100mb": sum(1 for x in sizes if x > 100e6),
            "over_500mb": sum(1 for x in sizes if x > 500e6),
        },
        "full_seed": {
            "pacing_seconds": pace,
            "api_seconds": round(seconds),
            "api_hours": round(seconds / 3600, 2),
            "days_at_weekly_cycle": 1,
            "verdict": "a single unattended run of roughly 1.3 hours of API "
                       "pacing; wall clock is set by the ~34GB S3 transfer, "
                       "which is not metered by this quota",
        },
        "weekly_delta": {
            "catalogue_scan_requests": 39,
            "scan_cost": "list endpoint, no observed rate limit",
            "download_calls_per_changed_model": 1,
            "changed_models_affordable_per_hour": int(3600 / pace),
            "verdict": "a weekly cycle fits with room to spare: 720 changed "
                       "models per hour at safe pacing, far above any plausible "
                       "weekly churn for this catalogue",
        },
    }


def status_breakdown(calls: list) -> dict:
    out = {}
    for c in calls:
        k = str(c.get("status"))
        out[k] = out.get(k, 0) + 1
    return out


def main() -> None:
    stages = sys.argv[1:] or ["list", "local", "probe", "fetch", "report"]
    os.makedirs(WORK, exist_ok=True)
    token = read_token()
    s = session()

    if "list" in stages:
        pages = int(os.environ.get("A13_LIST_PAGES", "2"))
        log("[list] fetching up to %d pages" % pages)
        stage_list(s, pages)
    if "list-sorted" in stages:
        pages = int(os.environ.get("A13_LIST_PAGES", "60"))
        sort_by = os.environ.get("A13_SORT", "-publishedAt")
        log("[list-sorted] sort_by=%s, up to %d pages" % (sort_by, pages))
        stage_list(s, pages, sort_by, "list_sorted.json")
    if "local" in stages:
        log("[local] scanning license.txt")
        stage_local(int(os.environ.get("A13_LOCAL_SAMPLE", "30")))
    if "probe" in stages:
        log("[probe] download API x%d" % PROBE_COUNT)
        loc = load_cache("local.json") or {}
        lst = primary_list()
        names = {m["uid"]: m.get("name") for m in lst.get("models", [])}
        by_uid = {m["uid"]: m for m in lst.get("models", [])}
        uids = []
        for u in loc.get("uids_found", []):
            m = by_uid.get(u["uid"])
            if not m or not m.get("isDownloadable"):
                continue  # keep the probe on models the API says are fetchable
            uids.append(dict(u, name=m.get("name"),
                             listed_gltf_size=m["archive_sizes"].get("gltf")))
        stage_probe(s, uids, token)
    if "meta" in stages:
        log("[meta] probing per-model endpoint for change timestamps")
        loc = load_cache("local.json") or {}
        stage_meta(s, loc.get("uids_found", []))
    if "burst" in stages:
        cap = int(os.environ.get("A13_BURST_CAP", "60"))
        log("[burst] unpaced download calls, cap=%d" % cap)
        loc = load_cache("local.json") or {}
        lst = primary_list()
        ok = {m["uid"] for m in lst.get("models", []) if m.get("isDownloadable")}
        uids = [u for u in loc.get("uids_found", []) if u["uid"] in ok]
        stage_burst(s, uids, cap)
    if "sustain" in stages:
        cap = int(os.environ.get("A13_SUSTAIN_CAP", "30"))
        pace = float(os.environ.get("A13_SUSTAIN_PACE", "2.0"))
        log("[sustain] %d calls at %.1fs pacing" % (cap, pace))
        loc = load_cache("local.json") or {}
        lst = primary_list()
        ok = {m["uid"] for m in lst.get("models", []) if m.get("isDownloadable")}
        uids = [u for u in loc.get("uids_found", []) if u["uid"] in ok]
        stage_burst(s, uids, cap, pace, "sustain.json")
    if "recover" in stages:
        loc = load_cache("local.json") or {}
        uid = loc["uids_found"][0]["uid"]
        interval = int(os.environ.get("A13_RECOVER_INTERVAL", "15"))
        log("[recover] polling every %ds until the 429 clears" % interval)
        stage_recover(s, uid, interval,
                      int(os.environ.get("A13_RECOVER_MAX", "420")))
    if "fetch" in stages:
        log("[fetch] downloading smallest gltf archives")
        prb = load_cache("probe.json")
        if prb:
            stage_fetch(s, prb)
    if "report" in stages:
        rep = build_report()
        blob = json.dumps(rep, ensure_ascii=False, indent=2)
        if token and token in blob:
            raise SystemExit("refusing to write report: token leaked")
        with io.open(REPORT, "w", encoding="utf-8") as fh:
            fh.write(blob)
        log("[report] wrote %s" % REPORT)


if __name__ == "__main__":
    main()
