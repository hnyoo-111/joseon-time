# -*- coding: utf-8 -*-
"""
우리 3D 자산 폴더명(영문)과 국가유산청(KHS) 공식 한글명 후보를 잇는 매칭 스크립트.

입력:
  data/assets.catalog.json      - 자산 506건 (folder = PK)
  data/classification.json      - folder별 class(A~D) / site
  data/khs.catalog.raw.json     - KHS 수집분 2,887건
  data/artifacts.meta.json - Sketchfab 설명문에서 확보한 신뢰 한글명(정답 앵커)

출력:
  data/korean-name-candidates.json
"""

import sys
import json
import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"

# --------------------------------------------------------------------------
# 1. 한글 -> 로마자 (개정 로마자 표기법 근사)
#    음절 단위로 끊어서 변환한다. 연음/자음동화는 적용하지 않는데,
#    우리 폴더명(Chokdae, Hyanggot_I, KingMyeonbok)이 대체로 음절 단위
#    표기를 따르기 때문에 오히려 매칭률이 높다.
# --------------------------------------------------------------------------

CHOSEONG = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss",
            "", "j", "jj", "ch", "k", "t", "p", "h"]
JUNGSEONG = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa",
             "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"]
JONGSEONG = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l",
             "l", "l", "p", "l", "m", "p", "t", "t", "ng", "t", "t", "k",
             "t", "p", "t"]


def romanize(text):
    out = []
    for ch in text:
        code = ord(ch)
        if 0xAC00 <= code <= 0xD7A3:
            idx = code - 0xAC00
            cho, jung, jong = idx // 588, (idx % 588) // 28, idx % 28
            out.append(CHOSEONG[cho] + JUNGSEONG[jung] + JONGSEONG[jong])
        elif ch.isalnum():
            out.append(ch.lower())
        else:
            out.append(" ")
    return "".join(out)


# --------------------------------------------------------------------------
# 2. 영문 토큰 -> 한글 표기 사전
#    값에 들어간 문자열이 relic_nm / hrtg_nm 안에 나타나면 득점한다.
# --------------------------------------------------------------------------

TERMS = {
    # 재질
    "gold": ["금", "순금"], "golden": ["금"], "gilt": ["금동"],
    "giltbronze": ["금동"], "gilt-bronze": ["금동"],
    "silver": ["은", "은제"], "bronze": ["청동", "동제"], "iron": ["철", "철제"],
    "steel": ["철"], "brass": ["유기", "놋"], "brassware": ["유기", "놋"],
    "jade": ["옥"], "glass": ["유리"], "crystal": ["수정"],
    "wood": ["나무", "목제"], "wooden": ["나무", "목제"], "stone": ["돌", "석", "석제"],
    "straw": ["짚", "볏짚"], "bamboo": ["대나무", "죽"], "clay": ["흙", "토"],
    "porcelain": ["자기", "백자", "청자"], "whiteporcelain": ["백자"],
    "celadon": ["청자"], "pottery": ["토기", "도기"], "lacquered": ["칠", "주칠"],
    "paper": ["종이", "지"],

    # 그릇 / 살림
    "bowl": ["발", "완", "그릇", "사발", "대접"], "bowls": ["발", "그릇", "사발"],
    "dish": ["접시"], "plate": ["접시"], "cup": ["잔", "배"], "glasscup": ["유리잔"],
    "jar": ["항아리", "호", "단지"], "bottle": ["병"], "ewer": ["주자", "주전자"],
    "teapot": ["주전자", "다관"], "pot": ["솥", "냄비", "단지"],
    "cauldron": ["솥", "정"], "kettle": ["솥"], "ladle": ["국자"],
    "scoop": ["국자", "구기"], "spoon": ["숟가락", "시"], "chopsticks": ["젓가락", "저"],
    "tray": ["쟁반", "반"], "basket": ["바구니", "광주리"], "bucket": ["두레박", "물통", "통"],
    "backet": ["두레박", "물통", "통"], "chest": ["궤", "함", "뒤주"],
    "box": ["함", "상자", "궤"], "cabinet": ["장", "농", "궤"],
    "cupboard": ["찬장", "장"], "shelf": ["선반", "시렁"], "shelves": ["선반", "시렁"],
    "bookshelf": ["책장", "서가", "책가"], "bookcase": ["책장", "서가"],
    "wardrobe": ["의걸이장", "장"], "stool": ["의자", "등받이"],
    "table": ["상", "탁자", "안"], "soban": ["소반", "반"], "desk": ["서안", "책상"],
    "chair": ["의자", "교의"], "throne": ["어좌", "용상", "옥좌"],
    "mat": ["자리", "돗자리", "석"], "sittingmat": ["방석", "자리"],
    "cushion": ["방석"], "blanket": ["이불", "요"], "mattress": ["요", "이불"],
    "mortar": ["절구"], "pestle": ["공이"], "sieve": ["체"], "whetstone": ["숫돌"],
    "anvil": ["모루"], "chisel": ["끌"], "spade": ["삽", "가래"], "hoe": ["호미"],
    "rake": ["갈퀴"], "broom": ["빗자루", "비"], "washbasin": ["대야", "세숫대야"],
    "chamberpot": ["요강"], "brazier": ["화로"], "stove": ["아궁이", "부뚜막"],
    "board": ["판", "도마"], "roller": ["홍두깨", "다듬이"], "pantry": ["찬장"],
    "rice": ["쌀", "밥"], "ricebag": ["쌀가마", "볏섬"], "cabbage": ["배추"],
    "bibimbap": ["비빔밥"], "coin": ["엽전", "전", "통보"],

    # 조명 / 향
    "candlestick": ["촛대", "촉대"], "chokdae": ["촉대", "촛대"],
    "candle": ["초", "촉"], "lamp": ["등", "등잔"], "lampstand": ["등가", "등잔대"],
    "light": ["조명", "등"], "lantern": ["등"], "incense": ["향"],
    "incenseburner": ["향로"], "burner": ["향로", "로"], "censer": ["향로"],
    "hyanggot": ["향곶이"], "hyangjoa": ["향좌아"],

    # 무기 / 의장
    "sword": ["검", "도", "환도"], "knife": ["도자", "칼", "검"],
    "handknife": ["손칼", "도자"], "gun": ["총통", "총"], "cannon": ["포", "총통"],
    "bullet": ["탄", "탄환"], "bomb": ["비격진천뢰", "탄"], "shell": ["탄"],
    "crossbow": ["쇠뇌", "노"], "helmet": ["투구"], "armor": ["갑옷", "갑"],
    "weapon": ["무기", "병기"], "flag": ["기", "깃발"], "arrow": ["화살"],
    "quiver": ["화살통"], "hwacha": ["화차"], "belt": ["요대", "허리띠", "대"],

    # 복식
    "crown": ["관", "금관", "면류관"], "cap": ["관모", "모"], "hat": ["갓", "모"],
    "headdress": ["쓰개", "머리장식"], "wig": ["가체", "다래"],
    "shoes": ["신", "혜", "신발"], "hye": ["혜"], "boot": ["화", "목화"],
    "robe": ["포", "장삼"], "jacket": ["저고리"], "jeogori": ["저고리"],
    "skirt": ["치마"], "chima": ["치마"], "attire": ["복식", "복"],
    "necklace": ["목걸이"], "earring": ["귀걸이"], "earrings": ["귀걸이"],
    "bracelet": ["팔찌"], "bracelets": ["팔찌"], "ring": ["반지"],
    "ornament": ["장식", "꾸미개"], "pendant": ["드리개", "장식"],
    "myeonbok": ["면복"], "king": ["국왕", "왕"], "prince": ["왕세자", "세자"],
    "queen": ["왕비"], "princess": ["공주", "옹주"],

    # 불교 / 능묘
    "buddha": ["불", "여래", "불상"], "bodhisattva": ["보살"],
    "pagoda": ["탑", "석탑"], "stupa": ["탑"], "sarira": ["사리"],
    "reliquary": ["사리기", "사리함"], "temple": ["사지", "절", "사"],
    "monk": ["승", "스님"], "guardian": ["신장", "수호"], "lion": ["사자"],
    "tomb": ["릉", "묘", "총"], "monument": ["비", "비석"],
    "zodiac": ["십이지", "12지"], "deities": ["신상", "신"],
    "literatus": ["문인석"], "well": ["우물"], "pond": ["연못", "지"],
    "corridor": ["회랑"], "transept": ["익랑"], "hall": ["전", "당", "청"],
    "lecture": ["강당"], "gate": ["문"], "wall": ["담", "담장"],
    "bridge": ["교", "다리"], "pier": ["교각"], "abutment": ["교대", "교각"],
    "pavilion": ["누각", "정"], "roof": ["지붕"], "tile": ["기와", "와당"],
    "rooftile": ["기와"], "brick": ["전", "벽돌"], "bell": ["종", "방울", "탁"],
    "windbell": ["풍탁", "풍경"], "handbell": ["요령", "금강령"],
    "wind": ["풍"], "smallbell": ["소종", "방울"], "goldcrown": ["금관"],
    "goldbell": ["금방울"], "stonepagoda": ["석탑"], "stonetable": ["상석"],
    "stonelion": ["석사자"], "stoneguardian": ["무인석", "석인상"],
    "threestory": ["삼층"], "threelegged": ["세발", "삼족"],
    "longnecked": ["장경"], "rooftile": ["기와", "와당"],
    "roofend": ["수막새", "와당"],
    "knocker": ["문고리", "고리"], "lock": ["자물쇠"], "padlock": ["자물쇠"],
    "funerary": ["부장품", "명기"], "coffin": ["관", "상여"],

    # 악기 / 의례
    "drum": ["고", "북"], "instrument": ["악기"], "jerye": ["제례"],
    "ritual": ["제사", "의례"], "banquet": ["연향", "진연"],
    "foldingscreen": ["병풍"], "screen": ["병풍"], "byungpoong": ["병풍"],
    "painting": ["그림", "화도"], "book": ["서책", "책"],
    "paperweight": ["서진", "문진"], "seal": ["인", "보", "새"],
    "royalseal": ["어보", "국새"], "mirror": ["거울"],
    "fan": ["부채", "선"], "rankstone": ["품계석"], "sundial": ["해시계", "앙부일구"],
    "clepsydra": ["자격루", "물시계"], "raingauge": ["측우기"],
    "gauge": ["측우기"], "pedestal": ["대", "받침"], "ruler": ["척", "자"],
    "chart": ["천상열차분야지도", "도"], "celestial": ["천문", "천상"],
    "weight": ["추", "저울추"], "weights": ["추", "저울추"],
    "pincers": ["족집게", "핀셋"], "tweezers": ["족집게", "핀셋"],
    "horse": ["말", "마"], "ox": ["소", "우"], "tiger": ["호랑이", "호"],
    "rabbit": ["토끼", "묘"], "snake": ["뱀", "사"], "sheep": ["양"],
    "monkey": ["원숭이", "신"], "rooster": ["닭", "유"], "dog": ["개", "술"],
    "pig": ["돼지", "해"], "bird": ["새", "조"], "phoenix": ["봉황"],
    "dragon": ["용"], "beast": ["귀면", "짐승"], "face": ["귀면", "인면"],
    "flower": ["화", "꽃"], "floral": ["화", "꽃"], "peony": ["모란"],
    "eggplant": ["가지"], "persimmon": ["감"], "cart": ["수레"],
    "rock": ["암석", "돌"], "gutter": ["홈통"], "fishing": ["낚시"],
    "rod": ["대"], "birdcage": ["새장", "어리"], "feed": ["모이"],
    "pouch": ["주머니"],
}

# 폴더명에 자주 붙는 무의미 토큰(형태 구분자 등)
STOPWORDS = {
    "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l",
    "the", "of", "with", "and", "in", "from", "for", "on", "shaped",
    "unit", "v01", "v02", "v03", "site", "gyeongju", "design",
    "reproduction", "small", "large", "medium", "long", "north", "south",
    "east", "west", "side", "no", "01", "02", "1", "2", "3",
}

# --------------------------------------------------------------------------
# 3. site(영문) -> KHS 한글 키워드. hrtg_nm 또는 relic_nm 에 포함되면 후보 풀.
# --------------------------------------------------------------------------

SITE_KEYWORDS = {
    "Gyeongbokgung": ["경복궁"],
    "Gwanghwamun": ["광화문", "경복궁"],
    "Changgyeonggung": ["창경궁"],
    "Unhyeongung": ["운현궁"],
    "Jongmyo": ["종묘", "영녕전", "제례"],
    "Inwang-dong Temple Site": ["인왕동"],
    "Tomb of King Seongdeok": ["성덕왕릉", "성덕대왕"],
    "Tomb of King Gyeongae": ["경애왕릉"],
    "Tomb of King Gyeongdeok": ["경덕왕릉"],
    "Tomb of King Heungdeok": ["흥덕왕릉"],
    "Tomb of King Heondeok": ["헌덕왕릉"],
    "Tomb of King Huigang": ["희강왕릉"],
    "Tomb of King Jima": ["지마왕릉"],
    "Tomb of Kim Yu-sin": ["김유신"],
    "Mado Shipwreck": ["마도", "태안해저", "태안 신진도", "조선통신사선"],
    "Chunyanggyo": ["춘양교"],
    "Woljeonggyo": ["월정교"],
    "Mudeungsan": ["무등산"],
    "Gyeseungsa": ["계승사"],
    "Gameunsa": ["감은사"],
    "Geumgwanchong Tomb": ["금관총"],
    "Cheonmachong Tomb": ["천마총"],
    "Hwangnamdaechong Tomb": ["황남대총"],
    "Houchong Tomb": ["호우총"],
    "Sikrichong Tomb": ["식리총"],
    "Oreung": ["오릉", "五陵"],
    "Yongjangsagok Valley": ["용장사곡", "용장골"],
    "Imunwon Hall": ["이문원", "측우"],
    "Private House": ["고택", "낙안읍성", "한옥", "소쇄원"],
}

# 폴더명 접두어에서 뽑히는 건물명 -> 한글 (있으면 가점)
BUILDING_HINTS = {
    "cheonchujeon": "천추전", "gangnyeongjeon": "강녕전", "geunjeongjeon": "근정전",
    "gyotaejeon": "교태전", "gyotaegjeon": "교태전", "gyotaejeonjeon": "교태전",
    "manchunjeon": "만춘전", "sajeongjeon": "사정전", "yeongnyeongjeon": "영녕전",
    "unhyun": "운현궁", "mado": "마도", "jongmyo": "종묘",
}

SITE_TOKENS = {t for s in SITE_KEYWORDS for t in re.split(r"[\s_\-]+", s.lower())}
SITE_TOKENS |= set(BUILDING_HINTS)

CAMEL = re.compile(r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])")


def tokenize(name):
    parts = re.split(r"[\s_\-\.]+", CAMEL.sub(" ", name))
    out = []
    for p in parts:
        p = re.sub(r"[^A-Za-z0-9]", "", p).lower()
        if p:
            out.append(p)
    return out


def letters(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def score_pair(folder_tokens, folder_flat, building_ko, entry):
    """폴더 하나와 KHS 항목 하나의 유사도. (score, why) 반환."""
    relic = entry["relic_nm"]
    hrtg = entry.get("hrtg_nm") or ""
    relic_rom = romanize(relic)
    relic_flat = letters(relic_rom)
    hay = relic + " " + hrtg
    why = []

    # (a) 로마자 신호
    rom_score = 0.0
    if folder_flat and relic_flat:
        ratio = SequenceMatcher(None, folder_flat, relic_flat).ratio()
        rom_score = ratio
        shorter = min(len(folder_flat), len(relic_flat))
        if shorter >= 5 and (folder_flat in relic_flat or relic_flat in folder_flat):
            rom_score = max(rom_score, 0.88)
        for tok in folder_tokens:
            if len(tok) >= 4 and tok in relic_flat:
                rom_score = max(rom_score, 0.80)
                why.append("로마자 '%s' 일치" % tok)
                break
        if rom_score >= 0.6 and not why:
            why.append("로마자 유사 %.2f (%s)" % (ratio, relic_rom.strip()))

    # (b) 용어 사전 신호
    #     한 글자짜리 한글 표기(서, 도, 전 …)는 아무 이름에나 걸리므로 가중치를 낮춘다.
    hits, checked, exact = 0.0, 0, False
    relic_bare = relic.strip()
    joined = "".join(folder_tokens)
    # 단일 토큰 + 인접 바이그램(windbell, incenseburner …) + 전체 결합
    compounds = ["".join(folder_tokens[i:i + 2]) for i in range(len(folder_tokens) - 1)]
    if len(folder_tokens) > 2:
        compounds.append(joined)
    probes = list(dict.fromkeys(folder_tokens + [c for c in compounds if c in TERMS]))
    for tok in probes:
        kos = TERMS.get(tok)
        if not kos and tok.endswith("s"):
            kos = TERMS.get(tok[:-1])
        if not kos:
            continue
        checked += 1
        for ko in kos:
            if ko in hay:
                hits += 1.0 if len(ko) > 1 else 0.5
                why.append("%s=%s" % (tok, ko))
                if relic_bare == ko:
                    exact = True
                break
    dict_score = min(hits / checked, 1.0) if checked else 0.0

    score = 0.55 * rom_score + 0.45 * dict_score
    if hits and rom_score >= 0.5:
        score += 0.08
    if exact:
        # 공식 한글명이 사전 표기와 정확히 같으면 강한 신호
        score += 0.15
        why.append("정확히 '%s'" % relic_bare)

    # 건물명 가점
    if building_ko and building_ko in hay:
        score += 0.15
        why.append("건물 %s 일치" % building_ko)

    # 소품(=우리 3D 유물과 성격이 같음) 소폭 가점
    if entry.get("asset_se") == "소품":
        score += 0.03

    return min(score, 1.0), why


def main():
    catalog = json.loads((DATA / "assets.catalog.json").read_text(encoding="utf-8"))
    classification = json.loads((DATA / "classification.json").read_text(encoding="utf-8"))
    khs = json.loads((DATA / "khs.catalog.raw.json").read_text(encoding="utf-8"))
    meta = json.loads((DATA / "artifacts.meta.json").read_text(encoding="utf-8"))

    known_ko = {a["folder"]: a["nameKo"] for a in meta.get("artifacts", [])
                if a.get("nameKo")}

    cls_by_folder = {a["folder"]: a for a in classification["assets"]}
    uid_by_folder = {a["folder"]: a.get("sketchfabUid") for a in catalog["assets"]}

    # 단청 문양은 우리 3D 자산에 대응물이 없어 후보 풀에서 제외
    pool_all = [e for e in khs
                if e.get("asset_se") != "전통문양" and e.get("relic_nm")]
    # 사이트가 없는(D류) 폴더는 소품·건조물만 대상으로 한다
    pool_generic = [e for e in pool_all if e.get("asset_se") in ("소품", "건조물")]

    # 사이트별 풀 미리 계산
    site_pools = {}
    for site, keys in SITE_KEYWORDS.items():
        site_pools[site] = [e for e in pool_all
                            if any(k in (e.get("hrtg_nm") or "") or k in e["relic_nm"]
                                   for k in keys)]

    results = []
    stat_any = stat_auto = 0
    unknown_sites = set()

    for asset in catalog["assets"]:
        folder = asset["folder"]
        info = cls_by_folder.get(folder, {})
        site = info.get("site")
        cls = info.get("class")

        tokens = tokenize(folder)
        building_ko = None
        for t in tokens:
            if t in BUILDING_HINTS:
                building_ko = BUILDING_HINTS[t]
                break
        content = [t for t in tokens
                   if t not in STOPWORDS and t not in SITE_TOKENS]
        if not content:
            content = [t for t in tokens if t not in STOPWORDS]
        folder_flat = letters("".join(content))

        site_scoped = bool(site and site_pools.get(site))
        if site_scoped:
            pool = site_pools[site]
            scope = "site:%s" % site
        else:
            if site and site not in SITE_KEYWORDS:
                unknown_sites.add(site)
            pool = pool_generic
            scope = "all" if not site else "all(KHS에 사이트 항목 없음:%s)" % site

        scored = []
        for e in pool:
            s, why = score_pair(content, folder_flat, building_ko, e)
            if s >= 0.35:
                scored.append((s, why, e))
        scored.sort(key=lambda x: -x[0])

        # 같은 한글명 중복 제거
        top, seen = [], set()
        for s, why, e in scored:
            if e["relic_nm"] in seen:
                continue
            seen.add(e["relic_nm"])
            top.append({
                "relicNm": e["relic_nm"],
                "khsUid": e["uid"],
                "hrtgNm": e.get("hrtg_nm") or "",
                "assetSe": e.get("asset_se"),
                "score": round(s, 3),
                "why": ", ".join(why[:3]) or "부분 유사",
            })
            if len(top) == 3:
                break

        # 사이트 후보 풀이 아주 작으면(능묘·교량 등) 근거가 약해도 그대로 보여준다.
        # 사람이 눈으로 고르는 편이 빠른 구간.
        if not top and site_scoped and len(pool) <= 15:
            ranked = sorted(
                pool,
                key=lambda e: -SequenceMatcher(
                    None, folder_flat, letters(romanize(e["relic_nm"]))).ratio())
            for e in ranked[:3]:
                if e["relic_nm"] in seen:
                    continue
                seen.add(e["relic_nm"])
                top.append({
                    "relicNm": e["relic_nm"],
                    "khsUid": e["uid"],
                    "hrtgNm": e.get("hrtg_nm") or "",
                    "assetSe": e.get("asset_se"),
                    "score": 0.3,
                    "why": "사이트 내 소수 항목 - 자동 근거 없음, 수동 확인 필요",
                })

        auto =bool(top) and top[0]["score"] >= 0.72 and (
            len(top) == 1 or top[0]["score"] - top[1]["score"] >= 0.10)

        rec = {
            "folder": folder,
            "site": site,
            "class": cls,
            "sketchfabUid": uid_by_folder.get(folder),
            "scope": scope,
            "candidates": top,
            "autoAccept": auto,
        }
        if folder in known_ko:
            rec["knownNameKo"] = known_ko[folder]
        results.append(rec)

        if top:
            stat_any += 1
        if auto:
            stat_auto += 1

    out = {
        "generatedBy": "data/scripts/match_korean_names.py",
        "summary": {
            "totalFolders": len(results),
            "withCandidates": stat_any,
            "autoAccept": stat_auto,
            "khsPoolSize": len(pool_all),
        },
        "folders": results,
    }
    path = DATA / "korean-name-candidates.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    print("총 폴더        : %d" % len(results))
    print("후보 1개 이상  : %d (%.1f%%)" % (stat_any, 100.0 * stat_any / len(results)))
    print("autoAccept     : %d (%.1f%%)" % (stat_auto, 100.0 * stat_auto / len(results)))
    print("KHS 후보 풀    : %d" % len(pool_all))
    if unknown_sites:
        print("매핑 없는 site : %s" % ", ".join(sorted(unknown_sites)))
    print("출력           : %s" % path)


if __name__ == "__main__":
    main()
