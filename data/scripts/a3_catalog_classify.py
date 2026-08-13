#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""A3 - build the asset catalog and the placement-class classification.

Reads data/_scan_manifest.json (produced by scan_assets.py, after A2 quarantine)
and writes:
  data/assets.catalog.json   one record per canonical folder
  data/classification.json   site attribution + batch placement class

Placement classes:
  A  immovable structure itself (gate, hall, bridge, tomb mound, rock formation)
  B  attached/subordinate structure placed in a regular arrangement around a site
     (zodiac deity reliefs, stone lions, monuments, rank stones, guardian statues)
  C  object belonging to a site (indoor furnishing, ritual instrument, excavated
     artifact attributed to a named tomb/temple/ship)
  D  standalone artifact with no site prefix and no usable placement context

Idempotent: pure function of the manifest, rewrites both outputs each run.
"""
import json
import os
import re
import sys
from collections import Counter, OrderedDict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MANIFEST = os.path.join(ROOT, "data", "_scan_manifest.json")
CATALOG_OUT = os.path.join(ROOT, "data", "assets.catalog.json")
CLASS_OUT = os.path.join(ROOT, "data", "classification.json")

# Reference figures from the prior day's audit, measured on the pre-dedup
# 571-folder set. Compared against, never used to steer classification.
REFERENCE = {
    "totalFolders": 571,
    "attributable": 235,
    "attributablePct": 41.2,
    "contextless": 336,
    "bySite": {
        "Gyeongbokgung": 75,
        "Unhyeongung": 45,
        "Jongmyo": 28,
        "Tomb of King Seongdeok": 25,
        "Tomb of Kim Yu-sin": 23,
    },
}

GBG_BUILDING_ALIAS = {
    "gyotaegjeon": "Gyotaejeon",
    "gyotaejeonjeon": "Gyotaejeon",
    "gyotaejeon": "Gyotaejeon",
    "cheonchujeon": "Cheonchujeon",
    "gangnyeongjeon": "Gangnyeongjeon",
    "geunjeongjeon": "Geunjeongjeon",
    "manchunjeon": "Manchunjeon",
    "sajeongjeon": "Sajeongjeon",
}

SILLA_KING_TOMBS = {
    "gyeongdeok": "Tomb of King Gyeongdeok",
    "heungdeok": "Tomb of King Heungdeok",
    "jima": "Tomb of King Jima",
    "heondeok": "Tomb of King Heondeok",
    "huigang": "Tomb of King Huigang",
}

# Excavated-artifact tombs: the folder names attribute the object to a tomb,
# but the object itself is a movable grave good, not a structure.
GRAVE_GOOD_SITES = {
    "cheonmachong": "Cheonmachong Tomb",
    "geumgwanchong": "Geumgwanchong Tomb",
    "hwangnamdaechong": "Hwangnamdaechong Tomb",
    "houchong": "Houchong Tomb",
    "sikrichong": "Sikrichong Tomb",
}

# Matched against norm(), which collapses hyphens/underscores to spaces.
INWANG_STRUCTURE_HINTS = (
    "building site", "corridor", "transept", "lecture hall", "main hall",
    "wall of", "well of", "ritual well", "pond", "stone pagoda", "cross shaped",
    "south side of the west corridor",
)


def norm(name):
    """Lowercase with separators collapsed to single spaces, for matching."""
    return re.sub(r"[_\-\s]+", " ", name).strip().lower()


def classify(folder):
    """Return (site, building, cls, confidence, reason) for one folder name."""
    n = norm(folder)

    # --- Gyeongbokgung: site_building_object ---------------------------------
    if n.startswith("gyeongbokgung"):
        parts = re.split(r"[_]+", folder)
        raw_building = parts[1] if len(parts) > 2 else None
        building = GBG_BUILDING_ALIAS.get(
            (raw_building or "").strip().lower(), raw_building)
        obj = parts[-1].strip().lower() if len(parts) > 2 else ""
        if "rankstone" in obj:
            return ("Gyeongbokgung", building, "B", "medium",
                    "Geunjeongjeon courtyard rank stone (pumgyeseok): follows the "
                    "3-part naming but is an outdoor stone marker set in a regular "
                    "rank-ordered arrangement, so it batches as attached structure "
                    "rather than indoor furnishing")
        if building:
            return ("Gyeongbokgung", building, "C", "high",
                    "3-part site_building_object name; indoor furnishing of a "
                    "named Gyeongbokgung hall")
        return ("Gyeongbokgung", None, "C", "medium",
                "Gyeongbokgung prefix without a building level")

    # --- Unhyeongung ---------------------------------------------------------
    if n.startswith("unhyun"):
        return ("Unhyeongung", None, "C", "high",
                "Unhyun_ prefix; household furnishing of Unhyeongung, 2-part "
                "site_object name with no building level")

    # --- Jongmyo -------------------------------------------------------------
    if n.startswith("jongmyo jerye"):
        return ("Jongmyo", None, "C", "high",
                "Jongmyo Jerye ritual instrument; movable ritual object of the "
                "Jongmyo rite, placed per the rite layout rather than fixed")
    if "yeongnyeongjeon" in n:
        return ("Jongmyo", "Yeongnyeongjeon", "A", "high",
                "Yeongnyeongjeon is a hall within the Jongmyo precinct")
    for office, kor in (("hyangdaecheong", "Hyangdaecheong"),
                        ("jeonsacheong", "Jeonsacheong"),
                        ("jaegung", "Jaegung")):
        if n.startswith(office):
            return ("Jongmyo", kor, "A", "high",
                    "%s is an auxiliary building of the Jongmyo precinct" % kor)

    # --- Tomb of King Seongdeok ---------------------------------------------
    if "tomb of king seongdeok" in n:
        site = "Tomb of King Seongdeok"
        if n == "tomb of king seongdeok gyeongju":
            return (site, None, "A", "high", "the tomb mound itself")
        if "12zodiac" in n.replace(" ", "") or "zodiac" in n:
            return (site, None, "B", "high",
                    "twelve zodiac deity relief set around the tomb perimeter; "
                    "regular circular arrangement")
        return (site, None, "B", "high",
                "stone furnishing of the tomb precinct (monument, guardian, lion, "
                "literatus or offering table) in a fixed symmetric arrangement")

    # --- Tomb of Kim Yu-sin --------------------------------------------------
    if "tomb of kim yu sin" in n or "tomb of kim yu-sin" in n:
        site = "Tomb of Kim Yu-sin"
        if n in ("tomb of kim yu sin gyeongju", "tomb of kim yu-sin gyeongju"):
            return (site, None, "A", "high", "the tomb mound itself")
        if "zodiac" in n:
            return (site, None, "B", "high",
                    "twelve zodiac deity relief set around the tomb perimeter; "
                    "regular circular arrangement")
        return (site, None, "B", "high",
                "stone furnishing of the tomb precinct (monument or offering "
                "table) in a fixed arrangement")

    # --- other Silla royal tombs --------------------------------------------
    if "tomb of king gyeongae" in n:
        site = "Tomb of King Gyeongae"
        if "stone table" in n:
            return (site, None, "B", "high",
                    "stone offering table of the tomb precinct")
        return (site, None, "A", "high", "the tomb mound itself")
    for key, site in SILLA_KING_TOMBS.items():
        if "tomb of king %s" % key in n:
            return (site, None, "A", "high", "Silla royal tomb mound itself")
    if n.startswith("five royal tombs"):
        return ("Oreung", None, "A", "high",
                "Oreung, the five royal tomb mounds of early Silla")

    # --- Mado shipwreck ------------------------------------------------------
    if n.startswith("mado "):
        return ("Mado Shipwreck", None, "C", "medium",
                "Mado_ prefix; cargo artifact recovered from the Mado shipwreck, "
                "site-attributed object rather than indoor furnishing")

    # --- Chunyanggyo / Woljeonggyo bridges -----------------------------------
    if "chunyanggyo" in n or "woljeonggyo" in n:
        site = "Chunyanggyo" if n.startswith("chunyanggyo") or \
            "in chunyanggyo" in n else "Woljeonggyo"
        if "infant buddha" in n:
            return ("Woljeonggyo", None, "C", "medium",
                    "gilt-bronze statue excavated at the Woljeonggyo bridge site; "
                    "movable artifact attributed to the site")
        return (site, None, "A", "high",
                "structural element of the bridge complex (gate, pavilion, pier "
                "or abutment); immovable structure in its own right")

    # --- natural / geological sites -----------------------------------------
    if n.startswith("mudeungsan"):
        return ("Mudeungsan", None, "A", "medium",
                "Mudeungsan columnar-joint rock unit; immovable natural site "
                "feature, structural body rather than an artifact")
    if n.startswith("cretaceous sedimentary structure"):
        return ("Gyeseungsa", None, "A", "medium",
                "Cretaceous sedimentary structure at Gyeseungsa; immovable "
                "natural site feature")

    # --- Inwang-dong temple site --------------------------------------------
    if "inwang" in n:
        if any(h in n for h in INWANG_STRUCTURE_HINTS):
            return ("Inwang-dong Temple Site", None, "A", "high",
                    "excavated building/structure of the Inwang-dong temple site")
        return ("Inwang-dong Temple Site", None, "C", "medium",
                "movable artifact (statue or roof tile) attributed to the "
                "Inwang-dong temple site")
    if "temple site" in n and ("cross shaped" in n or "west corridor" in n):
        return ("Inwang-dong Temple Site", None, "A", "medium",
                "excavation-series structure name matching the Inwang-dong temple "
                "site V01/V02 series, though the folder name omits the site")

    # --- Gameunsa reliquary --------------------------------------------------
    if "gameunsa" in n:
        return ("Gameunsa", None, "C", "high",
                "sarira reliquary implement from the west pagoda of Gameunsa")

    # --- grave goods attributed to named tombs -------------------------------
    for key, site in GRAVE_GOOD_SITES.items():
        if key in n:
            return (site, None, "C", "high",
                    "grave good excavated from %s; movable artifact attributed "
                    "to a named tomb" % site)

    # --- misc. named sites ---------------------------------------------------
    if n.startswith("private house"):
        return ("Private House", None, "A", "high",
                "component building or wall of the traditional private house set")
    if "gwanghwamun" in n:
        return ("Gwanghwamun", None, "B", "high",
                "haetae guardian statue placed in a fixed symmetric pair before "
                "Gwanghwamun gate")
    if "changgyeonggung" in n:
        return ("Changgyeonggung", None, "C", "high",
                "clepsydra installed at Changgyeonggung; site-attributed "
                "instrument")
    if "imunwon" in n:
        return ("Imunwon Hall", None, "C", "medium",
                "rain gauge and its pedestal installed at Imunwon hall")
    if "yongjangsagok" in n:
        return ("Yongjangsagok Valley", None, "A", "high",
                "stone pagoda standing in Yongjangsagok valley")

    # --- no site prefix ------------------------------------------------------
    if "zodiac" in n:
        return (None, None, "D", "low",
                "twelve zodiac deity statue with no site prefix; semantically a "
                "B-class perimeter set but unattributable from the folder name "
                "alone - promote to B once its source tomb is identified")
    return (None, None, "D", "low",
            "no site prefix and no placement context in the folder name; "
            "standalone artifact")


def main():
    with open(MANIFEST, "r", encoding="utf-8") as fh:
        manifest = json.load(fh)
    # Quarantined duplicates are in the manifest too; the catalog covers only
    # the canonical folders still living under heritage/asset/.
    records = [r for r in manifest["records"] if r.get("location") != "archive"]

    catalog = []
    classification = []
    for rec in records:
        catalog.append(OrderedDict([
            ("folder", rec["folder"]),
            ("sizeBytes", rec["sizeBytes"]),
            ("fileCount", rec["fileCount"]),
            ("hasGltf", rec["hasGltf"]),
            ("hasBin", rec["hasBin"]),
            ("texturesCount", rec["texturesCount"]),
            ("sketchfabUid", rec["sketchfabUid"]),
            ("licenseType", rec["licenseType"]),
            ("licenseTitle", rec["licenseTitle"]),
        ]))
        site, building, cls, conf, reason = classify(rec["folder"])
        classification.append(OrderedDict([
            ("folder", rec["folder"]),
            ("site", site),
            ("building", building),
            ("class", cls),
            ("confidence", conf),
            ("reason", reason),
        ]))

    by_class = Counter(c["class"] for c in classification)
    by_conf = Counter(c["confidence"] for c in classification)
    by_site = Counter(c["site"] for c in classification if c["site"])
    attributable = sum(1 for c in classification if c["site"])
    total = len(classification)

    # Integrity counters for the catalog side.
    missing_uid = [c["folder"] for c in catalog if not c["sketchfabUid"]]
    missing_gltf = [c["folder"] for c in catalog if not c["hasGltf"]]
    missing_bin = [c["folder"] for c in catalog if not c["hasBin"]]
    lic_types = Counter(c["licenseType"] or "(none)" for c in catalog)

    with open(CATALOG_OUT, "w", encoding="utf-8") as fh:
        json.dump({
            "generatedBy": "data/scripts/a3_catalog_classify.py",
            "assetDir": manifest["assetDir"],
            "summary": {
                "folderCount": len(catalog),
                "totalBytes": sum(c["sizeBytes"] for c in catalog),
                "totalGiB": round(sum(c["sizeBytes"] for c in catalog) / 1024 ** 3, 3),
                "withSketchfabUid": len(catalog) - len(missing_uid),
                "missingSketchfabUid": missing_uid,
                "missingGltf": missing_gltf,
                "missingBin": missing_bin,
                "licenseTypes": dict(lic_types),
            },
            "assets": catalog,
        }, fh, ensure_ascii=False, indent=1)

    delta = {}
    for site, ref in REFERENCE["bySite"].items():
        delta[site] = {"reference(pre-dedup)": ref, "actual(post-dedup)": by_site.get(site, 0),
                       "diff": by_site.get(site, 0) - ref}

    with open(CLASS_OUT, "w", encoding="utf-8") as fh:
        json.dump({
            "generatedBy": "data/scripts/a3_catalog_classify.py",
            "classDefinitions": {
                "A": "immovable structure itself (gate, hall, bridge element, tomb "
                     "mound, natural rock formation)",
                "B": "attached/subordinate structure placed in a regular "
                     "arrangement around a site",
                "C": "object belonging to a named site (indoor furnishing, ritual "
                     "instrument, site-attributed excavated artifact)",
                "D": "standalone artifact with no site prefix and no placement "
                     "context",
            },
            "summary": {
                "folderCount": total,
                "byClass": {k: by_class.get(k, 0) for k in "ABCD"},
                "byConfidence": dict(by_conf),
                "attributable": attributable,
                "attributablePct": round(attributable * 100.0 / total, 1),
                "contextless": total - attributable,
                "siteCount": len(by_site),
                "bySite": OrderedDict(sorted(by_site.items(), key=lambda kv: (-kv[1], kv[0]))),
            },
            "referenceComparison": {
                "note": "Reference figures were measured on the pre-dedup "
                        "571-folder set; actuals are the post-A2 506-folder "
                        "canonical set. Differences are expected to equal the "
                        "duplicates removed per site.",
                "reference": REFERENCE,
                "actualTotals": {
                    "totalFolders": total,
                    "attributable": attributable,
                    "attributablePct": round(attributable * 100.0 / total, 1),
                    "contextless": total - attributable,
                },
                "bySiteDelta": delta,
            },
            "assets": classification,
        }, fh, ensure_ascii=False, indent=1)

    print("total=%d A=%d B=%d C=%d D=%d attributable=%d (%.1f%%) sites=%d"
          % (total, by_class.get("A", 0), by_class.get("B", 0), by_class.get("C", 0),
             by_class.get("D", 0), attributable, attributable * 100.0 / total,
             len(by_site)))
    print("confidence:", dict(by_conf))
    print("no uid:", len(missing_uid), "no gltf:", len(missing_gltf),
          "no bin:", len(missing_bin))
    return 0


if __name__ == "__main__":
    sys.exit(main())
