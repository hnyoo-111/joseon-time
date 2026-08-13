#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""LLM 매칭 결과를 메타데이터에 병합해 뷰어용 데이터로 굳힌다.

입력
  data/artifacts.meta.json            수집된 메타데이터(해설·썸네일·태그)
  data/_llm_match_result_*.json       LLM 매칭 결과(pick·confidence·why)
출력
  data/artifacts.meta.json            nameKo/nameKoSource/nameKoConfidence 채워 갱신
  src/entities/artifact/model/artifacts.json  뷰어가 import 하는 파일

한글명 우선순위:
  1) Sketchfab 설명문에 박힌 공식 한글명(nameKo) — 원천 표기라 가장 신뢰도가 높다
  2) LLM 이 KHS 공식 목록에서 고른 이름 — confidence 로 자동확정/검수대기를 가른다
KHS 이름의 '경복궁 ' 같은 소속유산 접두어는 목록 표시에 군더더기라 표시용에서 떼고,
원문은 nameKoFull 로 남긴다.

사용:  python data/scripts/merge_korean_names.py
"""

from __future__ import annotations

import glob
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
META = os.path.join(ROOT, "data", "artifacts.meta.json")
VIEWER = os.path.join(ROOT, "src", "entities", "artifact", "model", "artifacts.json")

# 이 값 이상이면 사람 검수 없이 확정으로 본다(실측: 두 시행 100% 일치, A그룹 실질 14/14).
AUTO_CONFIRM = 0.85

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def load(path):
    with io.open(path, encoding="utf-8") as fh:
        return json.load(fh)


def collect_picks() -> dict:
    """매칭 결과 파일들을 folder → 최고 confidence 선택으로 합친다."""
    picks = {}
    for path in sorted(glob.glob(os.path.join(ROOT, "data", "_llm_match_result_*.json"))):
        blob = load(path)
        groups = [v for v in blob.values() if isinstance(v, list)]
        for rows in groups:
            for row in rows:
                f = row.get("folder")
                if not f or not row.get("pick"):
                    continue
                prev = picks.get(f)
                if prev is None or row.get("confidence", 0) > prev.get("confidence", 0):
                    picks[f] = row
    return picks


def strip_site_prefix(name: str, site_names) -> str:
    for s in site_names:
        if s and name.startswith(s + " "):
            return name[len(s) + 1:]
    return name


def main() -> None:
    meta = load(META)
    picks = collect_picks()
    khs = load(os.path.join(ROOT, "data", "khs.catalog.raw.json"))
    site_names = sorted({x.get("hrtg_nm") for x in khs if x.get("hrtg_nm")}, key=len, reverse=True)

    stats = {"sketchfab": 0, "llm_auto": 0, "llm_review": 0, "none": 0}
    for a in meta["artifacts"]:
        if a.get("nameKo"):
            a["nameKoSource"] = "sketchfab"
            a["nameKoFull"] = a["nameKo"]
            a["nameKoConfidence"] = 1.0
            stats["sketchfab"] += 1
            continue
        row = picks.get(a["folder"])
        if not row:
            a["nameKoSource"] = None
            stats["none"] += 1
            continue
        full = row["pick"]
        conf = float(row.get("confidence") or 0)
        a["nameKo"] = strip_site_prefix(full, site_names)
        a["nameKoFull"] = full
        a["nameKoConfidence"] = conf
        a["nameKoWhy"] = row.get("why")
        a["nameKoSource"] = "khs-llm"
        a["nameKoConfirmed"] = conf >= AUTO_CONFIRM
        stats["llm_auto" if conf >= AUTO_CONFIRM else "llm_review"] += 1

    meta["koreanNameStats"] = stats
    meta["koreanNamePolicy"] = {
        "autoConfirmThreshold": AUTO_CONFIRM,
        "note": "khs-llm 이면서 confirmed=false 인 항목은 사람 검수 대상",
    }
    with io.open(META, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(meta, ensure_ascii=False, indent=1))
    with io.open(VIEWER, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(meta, ensure_ascii=False, indent=1))

    total = len(meta["artifacts"])
    named = total - stats["none"]
    print("총 %d건 | 한글명 확보 %d건 (%.0f%%)" % (total, named, named * 100.0 / total))
    print("  원천(Sketchfab) %d · LLM 자동확정 %d · LLM 검수대기 %d · 미확보 %d"
          % (stats["sketchfab"], stats["llm_auto"], stats["llm_review"], stats["none"]))
    print("갱신: data/artifacts.meta.json, src/entities/artifact/model/artifacts.json")


if __name__ == "__main__":
    main()
