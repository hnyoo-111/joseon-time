#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""A4 - record the deprecation of the legacy name-similarity mappings.

Reads (never writes) the legacy mapping artifacts under heritage/data/, counts
them, runs automated defect checks against the post-A2 canonical asset set and
the A3 classification, and emits the deprecation record together with concrete
mismapping evidence.

Source files are treated as strictly read-only.

Output: data/deprecated-mappings.json
"""
import json
import os
import sys
from collections import OrderedDict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
HDATA = os.path.join(ROOT, "heritage", "data")
ASSET_DIR = os.path.join(ROOT, "heritage", "asset")
ARCHIVE_DIR = os.path.join(ROOT, "_archive", "duplicate_folders")
CLASS_FILE = os.path.join(ROOT, "data", "classification.json")
OUT = os.path.join(ROOT, "data", "deprecated-mappings.json")

# Immovable heritage designations: the designated object is a place/structure,
# so a mapping to a movable indoor object is a category error by construction.
IMMOVABLE_KINDS = {"사적", "명승", "천연기념물"}
TREASURE_KINDS = {"국보", "보물"}

# Manually verified mismappings. Each entry names the source file, the Korean
# heritage name as written in that file, the folder it points at, what that
# folder actually contains, and why the pair is wrong.
CURATED = [
    ("heritage_graph.json", "부여 정림사지 오층석탑", "국보", "Chisel",
     "끌(목공 공구)",
     "백제 오층석탑을 목공 공구 모델에 연결. 유물 종류·시대·크기 모두 무관하며 "
     "이름 유사도 매칭이 만들어 낸 대표적 오매핑."),
    ("heritage_graph.json", "경주 독락당", "보물", "Jar",
     "항아리(무맥락 단독 도기)",
     "독락당은 조선시대 건축물(부동산)인데 이동 가능한 일반 항아리 모델에 연결."),
    ("heritage_graph.json", "익산 나바위성당", "사적", "Rock",
     "바위(무맥락 자연물)",
     "근대 성당 건축물을 '바위' 모델에 연결. 사적(부동산)을 무맥락 D급 에셋에 "
     "매핑한 category error."),
    ("heritage_graph.json", "담양 금성산성", "사적", "Yanggeum",
     "양금(현악기)",
     "산성(부동산)을 국악기 모델에 연결. 두 대상 사이에 어떤 의미적 연결도 없음."),
    ("heritage_graph.json", "강화 덕진진", "사적", "Fire_Pot",
     "화로",
     "강화도 해안 진(요새) 유적을 화로 기물에 연결."),
    ("heritage_graph.json", "구서이면사무소", "문화유산자료", "Miyeonsa",
     "미연사(기물/악곡명)",
     "근대 면사무소 건물을 발음이 비슷한 별개 항목에 연결. "
     "'이면사무소'와 'Miyeonsa'의 표기 유사도에 의한 오매핑."),
    ("heritage_graph.json", "비", "시도기념물", "Mado_Ricebags",
     "마도 침몰선 출토 쌀가마니",
     "한 글자 이름 '비'(비석)가 마도선 화물 에셋에 연결됨. 짧은 이름이 "
     "유사도 매칭에서 폭주한 사례."),
    ("heritage_graph.json", "금관총 금관 및 금제 관식", "국보", "Jegwan_samryanggwan",
     "제관 삼량관(조선 제례용 관모)",
     "신라 금관을 조선시대 제례 관모에 연결. 시대(신라 vs 조선)와 재질이 모두 다름."),
    ("heritage_graph.json", "청동 은입사 포류수금문 정병", "국보", "GeumgunPodallyeong",
     "금군 포달령(복식)",
     "고려 청동 물병(정병)을 조선 군복 복식에 연결."),
    ("heritage_graph.json", "용암당 혜언 진영", "시도유형문화유산", "Danghye_female",
     "당혜(여성용 신발)",
     "승려 초상화(진영)를 신발 모델에 연결. '혜언'과 'Danghye'의 음절 겹침이 원인."),
    ("heritage_graph.json", "진천 정철 신도비", "시도유형문화유산", "Jeongjeol",
     "정절(기물)",
     "신도비(석비)를 발음이 유사한 별개 기물에 연결."),
    ("heritage_graph.json",
     "이하응 초상 일괄 - 흑단령포본, 금관조복본, 와룡관학창의본, 흑건청포본, 복건심의본",
     "보물", "Bokgeon",
     "복건(두건)",
     "흥선대원군 초상화 일괄(회화)을 복식 에셋에 연결. 유산명 끝의 '복건심의본'이라는 "
     "이본(異本) 이름에서 '복건'만 떼어 매칭한 결과로, 부분 문자열 일치가 "
     "전체 유물 종류를 뒤집은 사례."),
    ("heritage_graph.json", "경복궁", "사적", "Gyeongbokgung_Gangnyeongjeon_Cabinet",
     "경복궁 강녕전 장롱(실내 가구)",
     "궁궐 전체(사적)를 전각 하나의 실내 가구 한 점에 연결. 축척 granularity 오류."),
    ("heritage_graph.json", "경복궁 근정전", "국보",
     "Gyeongbokgung_Geunjeongjeon_Throne Chair", "근정전 어좌 의자(실내 기물)",
     "전각 건축물(국보)을 그 안의 의자 한 점에 연결. 건물 본체 에셋이 아님."),
    ("heritage_graph.json", "서울 운현궁", "사적", "Unhyun_ Wardrobe",
     "운현궁 옷장(실내 가구)",
     "궁 전체(사적)를 옷장 한 점에 연결. 축척 granularity 오류."),
    ("heritage_graph.json", "경주 김유신묘", "사적",
     "Tomb of Kim Yu-sin_12 Zodiac Animal Deities_006", "김유신묘 십이지신상 1기",
     "묘 본체(사적)를 둘레 십이지신상 12기 중 1기에만 연결. "
     "본체 에셋 'Tomb of Kim Yu-sin Gyeongju'가 따로 있는데도 부속물을 가리킴."),
    ("heritage_graph.json", "천상열차분야지도 각석", "국보",
     "Reproduction Of Celestial Chart Stone", "복각(복제) 천상열차분야지도 각석",
     "국보 원본을 복각본 에셋에 연결. 원본 에셋 'Celestial Chart Stone'이 "
     "별도로 존재하므로 명백한 오선택."),
    ("heritage_graph.json", "청자 양각연지어문 화형 접시", "보물", "Plate",
     "일반 접시(무맥락)",
     "지정 보물 청자를 무맥락 일반 접시 에셋에 연결."),
    ("gltf_mapping.json", "천마총 관모", None,
     "gold_cap_from_the_geumgwanchong_tomb", "금관총 출토 금제 관모",
     "천마총 유물을 금관총 유물 에셋에 연결. 출토 고분이 서로 다름."),
    ("gltf_mapping.json", "천마총 금관", None,
     "gold_crown_from_the_geumgwanchong_tomb", "금관총 금관",
     "천마총 금관을 금관총 금관 에셋에 연결. 출토 고분 불일치."),
    ("gltf_mapping.json", "황남대총 북분 은잔", None,
     "Silver Ladle from North Mound Hwangnamdaechong", "황남대총 북분 은제 국자",
     "은잔(盞, 잔)을 은제 국자(ladle) 에셋에 연결. 고분·위치는 맞으나 기물 종류가 다름."),
    ("gltf_mapping.json", "경주 성덕왕릉", None, "tomb_of_king_seongdeok_monument",
     "성덕왕릉 비석",
     "능 본체를 부속 비석 에셋에 연결. 본체 에셋 "
     "'Tomb Of King Seongdeok Gyeongju'가 존재함."),
    ("gltf_mapping.json", "신법 지평일구(1985-1)", None, "Horizontal Sundial_1985-2",
     "신법 지평일구 1985-2호",
     "지정번호 1985-1을 1985-2 에셋에 연결. 동일 계열 내 개체 번호 불일치."),
    ("gltf_mapping.json", "백자 병", None, "Unhyun_ White Porcelain Bottle",
     "운현궁 생활용 백자 병",
     "지정 유물 백자병을 운현궁 실내 기물 에셋에 연결. 출처·격이 다른 별개 유물."),
    ("gltf_mapping_improved.json", "경복궁 근정전", None, "Eunjeo",
     "은저(은수저)",
     "전각 건축물을 은수저에 연결. improved 판에서 오히려 더 나빠진 매핑."),
    ("gltf_mapping_improved.json", "청양 장곡사 철조약사여래좌상 및 석조대좌", None,
     "Janggo", "장구(타악기)",
     "철조 불상을 장구에 연결. '장곡사'와 'Janggo'의 로마자 표기 유사도가 원인."),
    ("gltf_mapping_improved.json", "진주 충무공동 익룡·새·공룡발자국 화석산지", None,
     "Mugo", "무고(북)",
     "공룡 발자국 화석산지(천연기념물, 부동산)를 북 모델에 연결."),
    ("gltf_mapping_improved.json", "서산 용현리 마애여래삼존상", None, "Rock",
     "바위(무맥락 자연물)",
     "국보 마애불(암벽 조각)을 무맥락 '바위' 에셋에 연결."),
    ("gltf_mapping_improved.json", "청주 용두사지 철당간", None, "Flag",
     "깃발",
     "철당간(철제 기둥 구조물)을 깃발 에셋에 연결. 당간에 걸던 깃발과 혼동."),
    ("gltf_mapping_improved.json", "대금정악", None, "Daegeum",
     "대금(악기)",
     "무형유산인 '대금정악'(음악·연주 종목)을 악기 실물 모델에 연결. "
     "무형/유형 범주 혼동."),
    ("gltf_mapping_improved.json", "백자 철화포도원숭이문 항아리", None, "Jar",
     "항아리(무맥락 단독 도기)",
     "국보 백자를 무맥락 일반 항아리 에셋에 연결."),
    ("gltf_mapping_improved.json", "천마총 자루솥", None, "cauldron",
     "일반 솥",
     "정확한 에셋 'Three-legged Cauldron From Cheonmachong Tomb'이 있는데도 "
     "무맥락 일반 솥으로 연결. gltf_mapping.json 대비 오히려 퇴보."),
    ("gltf_mapping_improved.json", "토우장식 장경호", None, "Long-necked Jar",
     "일반 장경호",
     "토우 장식이 있는 국보 장경호를 무맥락 일반 장경호로 연결. "
     "정확한 에셋 'Long necked Jar with Clay Figurines'이 존재함에도 퇴보."),
    ("gltf_mapping_improved.json", "황남대총 남분 유리병 및 잔", None, "glass",
     "유리(무맥락)",
     "국보 유리병 일괄을 무맥락 'glass' 에셋에 연결."),
    ("gltf_mapping_improved.json", "무령왕릉 지석", None, "Tablet",
     "일반 서판",
     "백제 무령왕릉 지석(국보)을 무맥락 일반 서판에 연결."),
    ("gltf_mapping_improved.json", "청자 상감당초문 완", None, "Bowl",
     "일반 사발",
     "국보 청자완을 무맥락 일반 사발에 연결."),
    ("gltf_mapping_improved.json", "귀면 청동로", None, "Brazier",
     "일반 화로",
     "국보 귀면 청동로를 무맥락 일반 화로에 연결."),
    ("gltf_mapping_improved.json", "별전 괴불(17족)", None, "Coin",
     "동전",
     "별전 괴불(장식용 매듭 공예품)을 동전 에셋에 연결."),
]


def load_json(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def nkey(s):
    return "".join((s or "").split())


def main():
    canonical = set(os.listdir(ASSET_DIR))
    archived = set(os.listdir(ARCHIVE_DIR)) if os.path.isdir(ARCHIVE_DIR) else set()
    cls = {c["folder"]: c for c in load_json(CLASS_FILE)["assets"]}

    # ---- enumerate legacy artifacts -------------------------------------
    files = []
    graph_mapped = []
    name_to_folder = {}   # normalized korean name -> {file: folder}

    for fname in sorted(os.listdir(HDATA)):
        if not fname.endswith(".json"):
            continue
        path = os.path.join(HDATA, fname)
        try:
            data = load_json(path)
        except (ValueError, OSError):
            continue

        entry = OrderedDict([
            ("file", ("heritage/data/" + fname)),
            ("sizeBytes", os.path.getsize(path)),
        ])

        if fname == "heritage_graph.json":
            nodes = data.get("nodes", [])
            mapped = [n for n in nodes if n.get("folder")]
            graph_mapped = mapped
            entry.update({
                "kind": "heritage graph with asset folder assignments",
                "entryCount": len(nodes),
                "folderAssignments": len(mapped),
                "deprecated": True,
                "reason": "이름 유사도 매칭으로 생성된 folder/eng_name 필드가 "
                          "국보·보물·사적을 무관한 에셋에 연결함",
            })
            for n in mapped:
                name_to_folder.setdefault(nkey(n["name"]), {})[fname] = n["folder"]
        elif fname.startswith("gltf_mapping"):
            entry.update({
                "kind": "korean heritage name -> asset folder mapping",
                "entryCount": len(data),
                "folderAssignments": sum(1 for v in data.values()
                                         if isinstance(v, dict) and v.get("folder")),
                "deprecated": True,
                "reason": "이름 유사도 기반 자동 매핑. 검증되지 않은 오매핑 다수",
            })
            for k, v in data.items():
                if isinstance(v, dict) and v.get("folder"):
                    key = nkey(v.get("orig_kor", "").split("(")[0] or k)
                    name_to_folder.setdefault(key, {})[fname] = v["folder"]
        elif fname.startswith("khs_search_mapping"):
            entry.update({
                "kind": "korean heritage name -> ccbaCpno lookup",
                "entryCount": len(data),
                "folderAssignments": 0,
                "deprecated": True,
                "reason": "에셋 매핑은 아니나 폐기 대상 매핑 파이프라인의 입력 "
                          "인덱스. 신규 매핑 재구축 시 재검증 후에만 재사용",
                "note": "폴더 매핑을 포함하지 않으므로 오매핑 사례의 직접 원인은 아님",
            })
        elif fname == "legacy_uid_mapping.json":
            entry.update({
                "kind": "legacy uid mapping",
                "entryCount": len(data),
                "folderAssignments": 0,
                "deprecated": True,
                "reason": "내용이 비어 있음(빈 객체). 사용처 없음",
            })
        elif fname == "local_assets_uid.json":
            entry.update({
                "kind": "local folder -> sketchfab uid index",
                "entryCount": len(data),
                "folderAssignments": len(data),
                "deprecated": False,
                "reason": "의미 매핑이 아니라 로컬 폴더-uid 사실 인덱스이므로 "
                          "폐기 대상 아님. 단 A2 격리 이후 폴더명 기준 재생성 필요",
            })
        elif fname == "sketchfab_models_all.json":
            entry.update({
                "kind": "sketchfab model listing",
                "entryCount": len(data) if hasattr(data, "__len__") else None,
                "folderAssignments": 0,
                "deprecated": False,
                "reason": "원본 스케치팹 목록. 사실 데이터이므로 유지",
            })
        else:
            continue
        files.append(entry)

    # ---- automated defect checks ----------------------------------------
    stale, granularity, generic, disagree = [], [], [], []

    for n in graph_mapped:
        folder, name, kind = n["folder"], n["name"], n.get("kind")
        if folder not in canonical:
            stale.append(OrderedDict([
                ("file", "heritage/data/heritage_graph.json"),
                ("heritageName", name), ("folder", folder),
                ("state", "archived-as-duplicate" if folder in archived
                          else "folder-not-found"),
                ("detail", "A2 중복 격리로 대표 폴더가 바뀌어 포인터가 무효화됨"
                           if folder in archived else "존재하지 않는 폴더를 가리킴"),
            ]))
        c = cls.get(folder)
        if not c:
            continue
        if kind in IMMOVABLE_KINDS and c["class"] in ("C", "D"):
            granularity.append(OrderedDict([
                ("heritageName", name), ("kind", kind), ("folder", folder),
                ("folderClass", c["class"]), ("folderSite", c["site"]),
                ("detail", "부동산 지정유산이 이동 가능한 기물/무맥락 에셋에 연결됨"),
            ]))
        if kind in TREASURE_KINDS and c["class"] == "D":
            generic.append(OrderedDict([
                ("heritageName", name), ("kind", kind), ("folder", folder),
                ("detail", "지정 유물이 사이트 맥락 없는 D급 일반 에셋에 연결됨"),
            ]))

    for key, per_file in name_to_folder.items():
        if len({v for v in per_file.values()}) > 1:
            disagree.append(OrderedDict([
                ("heritageNameKey", key),
                ("folderPerFile", per_file),
                ("detail", "동일 유산명이 파일마다 다른 폴더를 가리킴 - "
                           "매핑 파이프라인이 재현 불가능함을 보여주는 증거"),
            ]))

    # Every curated claim is re-checked against the source file, so the record
    # cannot drift from what the legacy files actually say.
    def verify(fname, kor, folder):
        path = os.path.join(HDATA, fname)
        data = load_json(path)
        if fname == "heritage_graph.json":
            for n in data.get("nodes", []):
                if nkey(n.get("name")) == nkey(kor):
                    return n.get("folder") == folder
            return False
        for k, v in data.items():
            if not isinstance(v, dict):
                continue
            # orig_kor is "<hangul> ( <hanja> )"; split on the spaced paren only,
            # so designation numbers like "(1985-1)" survive.
            orig = v.get("orig_kor", "").split(" ( ")[0]
            if nkey(kor) in (nkey(k), nkey(orig)):
                return v.get("folder") == folder
        return False

    curated, unverified = [], []
    for f, kor, kind, folder, meaning, why in CURATED:
        ok = verify(f, kor, folder)
        if not ok:
            unverified.append({"file": f, "heritageName": kor, "folder": folder})
        curated.append(OrderedDict([
            ("file", "heritage/data/" + f),
            ("heritageName", kor), ("designation", kind),
            ("mappedFolder", folder), ("folderActuallyIs", meaning),
            ("verifiedAgainstSource", ok),
            ("folderExists", folder in canonical),
            ("folderClass", (cls.get(folder) or {}).get("class")),
            ("why", why),
        ]))

    report = OrderedDict([
        ("generatedBy", "data/scripts/a4_deprecate_mappings.py"),
        ("deprecationNotice", OrderedDict([
            ("status", "DEPRECATED"),
            ("declaredOn", "2026-08-11"),
            ("statement",
             "heritage/data/ 의 기존 유산명-에셋 매핑(gltf_mapping.json, "
             "gltf_mapping_improved.json, heritage_graph.json 의 folder/eng_name "
             "필드, khs_search_mapping 계열)을 전면 폐기한다. 이 매핑들은 한국어 "
             "유산명과 영문 폴더명 사이의 문자열 유사도로 생성되어 의미 검증을 "
             "거치지 않았고, 국보·보물·사적을 전혀 무관한 에셋에 연결하는 오매핑을 "
             "구조적으로 포함한다. 어떤 신규 기능도 이 파일들을 신뢰 소스로 "
             "사용해서는 안 된다."),
            ("originalFilesUntouched", True),
            ("replacement",
             "data/assets.catalog.json + data/classification.json 을 기준으로 "
             "사이트 귀속과 배치 클래스를 재구축하고, 유산명 연결은 sketchfabUid "
             "기반 검증을 거친 신규 매핑으로 대체한다."),
            ("rootCause",
             "heritage/scripts/ 의 map_assets.py / improve_mapping.py / "
             "targeted_mapping.py / rebuild_mapping_v3.py 계열이 이름 유사도 "
             "점수만으로 최적 후보를 선택하고, 임계값 미만에서도 최근접 후보를 "
             "강제 채택했기 때문"),
        ])),
        ("deprecatedFiles", files),
        ("evidenceSummary", OrderedDict([
            ("curatedMismappings", len(curated)),
            ("curatedVerifiedAgainstSource", len(curated) - len(unverified)),
            ("curatedUnverified", unverified),
            ("stalePointers", len(stale)),
            ("granularityErrors", len(granularity)),
            ("genericAssetForDesignatedTreasure", len(generic)),
            ("crossFileDisagreements", len(disagree)),
            ("graphFolderAssignments", len(graph_mapped)),
        ])),
        ("curatedMismappings", curated),
        ("automatedChecks", OrderedDict([
            ("stalePointers", stale),
            ("granularityErrors", granularity),
            ("genericAssetForDesignatedTreasure", generic),
            ("crossFileDisagreements", disagree),
        ])),
    ])

    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=1)

    e = report["evidenceSummary"]
    print("files=%d curated=%d stale=%d granularity=%d generic=%d disagree=%d"
          % (len(files), e["curatedMismappings"], e["stalePointers"],
             e["granularityErrors"],
             e["genericAssetForDesignatedTreasure"],
             e["crossFileDisagreements"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
