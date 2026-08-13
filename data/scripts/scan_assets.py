#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Scan heritage/asset/ folders and emit a metadata manifest.

Metadata only: file names + sizes. No file content hashing (39.5GB corpus).
Idempotent: rewrites the manifest from a fresh filesystem walk every run.

Output: data/_scan_manifest.json
"""
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ASSET_DIR = os.path.join(ROOT, "heritage", "asset")
ARCHIVE_DIR = os.path.join(ROOT, "_archive", "duplicate_folders")
OUT = os.path.join(ROOT, "data", "_scan_manifest.json")

SKETCHFAB_UID_RE = re.compile(r"sketchfab\.com/3d-models/([a-zA-Z0-9\-]+)")
LICENSE_TYPE_RE = re.compile(r"license type:\s*(.+?)\s*(?:\(|$)", re.MULTILINE)
TITLE_RE = re.compile(r"^\*\s*title:\s*(.+?)\s*$", re.MULTILINE)


def parse_license(path):
    """Extract sketchfab uid, license type and title from a license.txt."""
    out = {"sketchfabUid": None, "licenseType": None, "licenseTitle": None}
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read()
    except OSError:
        return out

    m = SKETCHFAB_UID_RE.search(text)
    if m:
        slug = m.group(1)
        # URL slug is "<name-slug>-<32 hex uid>"; keep only the uid tail.
        tail = slug.rsplit("-", 1)[-1]
        out["sketchfabUid"] = tail if re.fullmatch(r"[0-9a-f]{32}", tail) else slug
    m = LICENSE_TYPE_RE.search(text)
    if m:
        out["licenseType"] = m.group(1).strip()
    m = TITLE_RE.search(text)
    if m:
        out["licenseTitle"] = m.group(1).strip()
    return out


def scan_folder(folder_path):
    """Walk one asset folder, collecting relative file paths and sizes."""
    files = {}
    total = 0
    textures = 0
    for dirpath, _dirnames, filenames in os.walk(folder_path):
        rel_dir = os.path.relpath(dirpath, folder_path).replace("\\", "/")
        for fname in filenames:
            full = os.path.join(dirpath, fname)
            try:
                size = os.path.getsize(full)
            except OSError:
                size = -1
            rel = fname if rel_dir == "." else rel_dir + "/" + fname
            files[rel] = size
            total += max(size, 0)
            if rel_dir.lower().startswith("textures"):
                textures += 1
    return files, total, textures


def main():
    if not os.path.isdir(ASSET_DIR):
        sys.stderr.write("asset dir not found: %s\n" % ASSET_DIR)
        return 1

    # The archive is scanned too so the A2 report stays reproducible after the
    # quarantine moves have already been applied.
    records = []
    roots = [("asset", ASSET_DIR)]
    if os.path.isdir(ARCHIVE_DIR):
        roots.append(("archive", ARCHIVE_DIR))

    for location, root in roots:
        for name in sorted(os.listdir(root)):
            path = os.path.join(root, name)
            if not os.path.isdir(path):
                continue
            records.append(build_record(name, path, location))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump({
            "assetDir": ASSET_DIR.replace("\\", "/"),
            "archiveDir": ARCHIVE_DIR.replace("\\", "/"),
            "folderCount": sum(1 for r in records if r["location"] == "asset"),
            "archivedCount": sum(1 for r in records if r["location"] == "archive"),
            "totalBytes": sum(r["sizeBytes"] for r in records
                              if r["location"] == "asset"),
            "records": records,
        }, fh, ensure_ascii=False, indent=1)

    live = [r for r in records if r["location"] == "asset"]
    print("scanned %d live folders (%.2f GiB) + %d archived -> %s"
          % (len(live), sum(r["sizeBytes"] for r in live) / 1024 ** 3,
             len(records) - len(live), OUT))
    return 0


def build_record(name, path, location):
    """Metadata record for one asset folder."""
    files, total, textures = scan_folder(path)
    lic = parse_license(os.path.join(path, "license.txt"))
    lower = {k.lower() for k in files}
    return {
        "folder": name,
        "location": location,
        "sizeBytes": total,
        "fileCount": len(files),
        "hasGltf": "scene.gltf" in lower,
        "hasBin": "scene.bin" in lower,
        "hasLicense": "license.txt" in lower,
        "texturesCount": textures,
        "sketchfabUid": lic["sketchfabUid"],
        "licenseType": lic["licenseType"],
        "licenseTitle": lic["licenseTitle"],
        "files": files,
    }


if __name__ == "__main__":
    sys.exit(main())
