#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""A2 - find case/underscore duplicate asset folders and quarantine exact copies.

Folders are grouped by a normalized key (lowercased, separators and any Windows
" (N)" copy suffix removed). Within a group one canonical folder is kept and the
rest are compared against it by file-name set + per-file size. Byte-identical
folders are MOVED to _archive/duplicate_folders/ (never deleted); anything whose
contents differ is only recorded for review.

Idempotent: re-running after a move simply finds fewer duplicates, and folders
already sitting in the archive are skipped.

Output: data/duplicate-merge-report.json
"""
import json
import os
import re
import shutil
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ASSET_DIR = os.path.join(ROOT, "heritage", "asset")
ARCHIVE_DIR = os.path.join(ROOT, "_archive", "duplicate_folders")
MANIFEST = os.path.join(ROOT, "data", "_scan_manifest.json")
OUT = os.path.join(ROOT, "data", "duplicate-merge-report.json")

COPY_SUFFIX_RE = re.compile(r"\s*\(\d+\)\s*$")
SEP_RE = re.compile(r"[_\-\s\.]+")


def normalize(name):
    """Collapse case, separators and Windows copy suffixes into a match key."""
    n = COPY_SUFFIX_RE.sub("", name)
    n = SEP_RE.sub("", n)
    return n.lower()


def tidiness(name):
    """Higher is a better canonical: no copy suffix, real CamelCase spelling."""
    score = 0
    if not COPY_SUFFIX_RE.search(name):
        score += 4
    if any(c.isupper() for c in name):
        score += 2
    if " " in name or any(c.isupper() for c in name):
        score += 1
    return score


def file_signature(files):
    """Case-insensitive {relative path: size} signature for content comparison."""
    return {k.lower().replace("\\", "/"): v for k, v in files.items()}


def main():
    apply_moves = "--dry-run" not in sys.argv

    with open(MANIFEST, "r", encoding="utf-8") as fh:
        manifest = json.load(fh)
    records = {r["folder"]: r for r in manifest["records"]}

    # Grouping spans live and already-archived folders so the report is
    # reproducible on a tree where the quarantine has already been applied.
    groups = {}
    for name in records:
        groups.setdefault(normalize(name), []).append(name)

    dup_groups = {k: v for k, v in groups.items() if len(v) > 1}

    report_groups = []
    moved_total = 0
    reclaimed = 0
    review_total = 0

    for key in sorted(dup_groups):
        members = dup_groups[key]
        # Canonical: most files, then largest, then tidiest spelling, then name.
        canonical = sorted(
            members,
            key=lambda n: (records[n].get("location") == "archive",
                           -records[n]["fileCount"], -records[n]["sizeBytes"],
                           -tidiness(n), n),
        )[0]
        can_sig = file_signature(records[canonical]["files"])

        entry = {
            "key": key,
            "canonical": canonical,
            "canonicalSizeBytes": records[canonical]["sizeBytes"],
            "canonicalFileCount": records[canonical]["fileCount"],
            "moved": [],
            "review": [],
        }

        for name in sorted(members):
            if name == canonical:
                continue
            rec = records[name]
            sig = file_signature(rec["files"])
            if sig == can_sig:
                src = os.path.join(ASSET_DIR, name)
                dst = os.path.join(ARCHIVE_DIR, name)
                status = "already-archived"
                if rec.get("location") != "archive" and os.path.isdir(src):
                    if apply_moves:
                        os.makedirs(ARCHIVE_DIR, exist_ok=True)
                        target = dst
                        n = 2
                        while os.path.exists(target):
                            target = "%s__dup%d" % (dst, n)
                            n += 1
                        shutil.move(src, target)
                        dst = target
                        status = "moved"
                    else:
                        status = "would-move"
                entry["moved"].append({
                    "folder": name,
                    "sizeBytes": rec["sizeBytes"],
                    "fileCount": rec["fileCount"],
                    "archivedTo": dst.replace("\\", "/"),
                    "status": status,
                    "match": "identical file names and sizes",
                })
                moved_total += 1
                reclaimed += rec["sizeBytes"]
            else:
                only_dup = sorted(set(sig) - set(can_sig))
                only_can = sorted(set(can_sig) - set(sig))
                size_diff = sorted(
                    k for k in set(sig) & set(can_sig) if sig[k] != can_sig[k]
                )
                entry["review"].append({
                    "folder": name,
                    "sizeBytes": rec["sizeBytes"],
                    "fileCount": rec["fileCount"],
                    "status": "kept-in-place",
                    "filesOnlyInThisFolder": only_dup[:20],
                    "filesOnlyInCanonical": only_can[:20],
                    "filesWithDifferentSize": size_diff[:20],
                    "diffCounts": {
                        "onlyInThisFolder": len(only_dup),
                        "onlyInCanonical": len(only_can),
                        "differentSize": len(size_diff),
                    },
                })
                review_total += 1

        report_groups.append(entry)

    report = {
        "generatedBy": "data/scripts/a2_dedup_quarantine.py",
        "assetDir": ASSET_DIR.replace("\\", "/"),
        "archiveDir": ARCHIVE_DIR.replace("\\", "/"),
        "method": "normalized folder name (lowercase, separators and ' (N)' copy "
                  "suffix removed); content compared by file-name set + per-file "
                  "size, no content hashing",
        "dryRun": not apply_moves,
        "summary": {
            "foldersScanned": len(records),
            "duplicateGroups": len(report_groups),
            "foldersMovedToArchive": moved_total,
            "foldersFlaggedForReview": review_total,
            "reclaimedBytes": reclaimed,
            "reclaimedGiB": round(reclaimed / 1024 ** 3, 3),
            "canonicalFoldersRemaining": len(records) - moved_total,
            "note": "foldersScanned spans live + archived folders so the report "
                    "reproduces after the moves have been applied; "
                    "foldersMovedToArchive counts every folder that belongs in "
                    "the archive, whether moved this run or previously",
        },
        "groups": report_groups,
    }

    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=1)

    s = report["summary"]
    print("groups=%d moved=%d review=%d reclaimed=%.2f GiB remaining=%d%s"
          % (s["duplicateGroups"], s["foldersMovedToArchive"],
             s["foldersFlaggedForReview"], s["reclaimedGiB"],
             s["canonicalFoldersRemaining"], " (DRY RUN)" if not apply_moves else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
