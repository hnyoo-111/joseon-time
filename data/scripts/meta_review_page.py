#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""표본 메타데이터 검수 페이지 생성.

data/artifacts.meta.json 을 사람이 눈으로 판단할 수 있는 HTML 로 만든다.
썸네일은 data: URI 로 인라인한다 — Artifact 로 게시하면 외부 이미지가 CSP 에 막히기 때문.

사용:  python data/scripts/meta_review_page.py
출력:  .omc/artifacts/meta-sample.html (게시용, 저장소 산출물 아님 - .omc 는 gitignore)
"""

from __future__ import annotations

import base64
import html
import io
import json
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "data", "artifacts.meta.json")
OUT_DIR = os.path.join(ROOT, ".omc", "artifacts")
OUT = os.path.join(OUT_DIR, "meta-sample.html")

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def data_uri(url: str) -> str:
    with urllib.request.urlopen(url, timeout=25) as r:
        raw = r.read()
        mime = r.headers.get("Content-Type", "image/jpeg").split(";")[0]
    return "data:%s;base64,%s" % (mime, base64.b64encode(raw).decode("ascii"))


def esc(v) -> str:
    return html.escape(str(v)) if v is not None else ""


CSS = """
:root{
  --ground:#F6F8F6; --surface:#FFFFFF; --edge:#DDE4DF;
  --ink:#1B211E; --muted:#5D6762; --faint:#8A948E;
  --celadon:#3E7C6A; --celadon-soft:#E4EFEA;
  --flag:#A85A2C; --flag-soft:#F6E7DC;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --ground:#111614; --surface:#19201D; --edge:#2C3733;
    --ink:#E9EEEA; --muted:#9AA5A0; --faint:#6F7B76;
    --celadon:#74B7A0; --celadon-soft:#1E2E29;
    --flag:#D08B5E; --flag-soft:#33241A;
  }
}
:root[data-theme="dark"]{
  --ground:#111614; --surface:#19201D; --edge:#2C3733;
  --ink:#E9EEEA; --muted:#9AA5A0; --faint:#6F7B76;
  --celadon:#74B7A0; --celadon-soft:#1E2E29;
  --flag:#D08B5E; --flag-soft:#33241A;
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--ground); color:var(--ink);
  font-family:"Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif;
  line-height:1.65; -webkit-font-smoothing:antialiased;
}
.wrap{max-width:1140px; margin:0 auto; padding:48px 24px 80px; display:flex; flex-direction:column; gap:40px}
.head{display:flex; flex-direction:column; gap:10px}
.eyebrow{
  font-size:12px; letter-spacing:.16em; text-transform:uppercase;
  color:var(--celadon); font-weight:700;
}
h1{
  font-family:"Nanum Myeongjo",Batang,"Apple SD Gothic Neo",Georgia,serif;
  font-size:clamp(28px,4vw,40px); line-height:1.25; margin:0; text-wrap:balance; font-weight:700;
}
.sub{color:var(--muted); max-width:62ch; margin:0}
.stats{display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:1px;
  background:var(--edge); border:1px solid var(--edge); border-radius:10px; overflow:hidden}
.stat{background:var(--surface); padding:18px 20px; display:flex; flex-direction:column; gap:6px}
.stat dt{font-size:12.5px; color:var(--muted); margin:0}
.stat dd{margin:0; font-size:26px; font-weight:700; font-variant-numeric:tabular-nums;
  font-family:ui-monospace,Consolas,monospace}
.stat.ok dd{color:var(--celadon)} .stat.low dd{color:var(--flag)}
.bar{height:4px; border-radius:2px; background:var(--edge); overflow:hidden}
.bar i{display:block; height:100%; background:var(--celadon)}
.stat.low .bar i{background:var(--flag)}
.grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:18px}
.card{background:var(--surface); border:1px solid var(--edge); border-radius:12px;
  overflow:hidden; display:flex; flex-direction:column}
.card img{width:100%; aspect-ratio:4/3; object-fit:cover; background:var(--celadon-soft); display:block}
.body{padding:16px 18px 18px; display:flex; flex-direction:column; gap:10px}
.names{display:flex; flex-direction:column; gap:3px}
.ko{font-family:"Nanum Myeongjo",Batang,serif; font-size:19px; font-weight:700; line-height:1.3}
.ko.miss{color:var(--flag); font-family:inherit; font-size:15px; font-weight:600}
.en{font-size:13px; color:var(--muted); font-family:ui-monospace,Consolas,monospace; word-break:break-word}
.chips{display:flex; flex-wrap:wrap; gap:6px}
.chip{font-size:11.5px; padding:3px 9px; border-radius:999px; background:var(--celadon-soft);
  color:var(--celadon); font-weight:600; letter-spacing:.02em}
.chip.flag{background:var(--flag-soft); color:var(--flag)}
.chip.plain{background:transparent; border:1px solid var(--edge); color:var(--faint); font-weight:500}
.desc{font-size:13.5px; color:var(--muted); margin:0;
  display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden}
.src{font-size:11.5px; color:var(--faint); font-family:ui-monospace,Consolas,monospace}
.note{border-left:3px solid var(--celadon); padding:2px 0 2px 16px; color:var(--muted); max-width:66ch}
.note b{color:var(--ink)}
"""


def main() -> None:
    with io.open(SRC, encoding="utf-8") as fh:
        rep = json.load(fh)
    arts = rep["artifacts"]
    n = len(arts)
    cov = rep["coverage"]

    print("썸네일 인라인 중 — %d건" % n)
    for a in arts:
        try:
            a["_img"] = data_uri(a["thumbnail"])
        except Exception as exc:
            a["_img"] = ""
            print("  ! 썸네일 실패 %s (%s)" % (a["folder"], exc))

    stat_defs = [
        ("썸네일", cov["thumbnail"]), ("해설문", cov["description"]),
        ("분류·태그", cov["tags"]), ("한글명", cov["nameKo"]), ("사이트 연관", cov["site"]),
    ]
    stats = []
    for label, v in stat_defs:
        pct = round(v * 100 / n)
        cls = "ok" if pct >= 80 else "low"
        stats.append(
            '<div class="stat %s"><dt>%s</dt><dd>%d<span style="font-size:14px;color:var(--faint)">/%d</span></dd>'
            '<div class="bar"><i style="width:%d%%"></i></div></div>' % (cls, esc(label), v, n, pct)
        )

    cards = []
    for a in arts:
        ko = a.get("nameKo")
        name_html = ('<div class="ko">%s</div>' % esc(ko)) if ko else \
                    '<div class="ko miss">한글명 없음 — 별도 확보 필요</div>'
        chips = []
        if a.get("site"):
            chips.append('<span class="chip">%s</span>' % esc(a["site"]))
        if not ko:
            chips.append('<span class="chip flag">한글명 결측</span>')
        for t in (a.get("tags") or [])[:5]:
            chips.append('<span class="chip plain">%s</span>' % esc(t))
        src = a.get("descriptionSource")
        cards.append(
            '<article class="card">'
            '<img src="%s" alt="%s 썸네일">'
            '<div class="body"><div class="names">%s<div class="en">%s</div></div>'
            '<div class="chips">%s</div><p class="desc">%s</p>%s</div></article>'
            % (a["_img"], esc(a.get("nameEn")), name_html, esc(a.get("nameEn")),
               "".join(chips), esc(a.get("description") or "(해설 없음)"),
               ('<div class="src">출처 · %s</div>' % esc(src)) if src else "")
        )

    page = (
        "<title>유물 메타데이터 검수</title>\n<style>%s</style>\n"
        '<div class="wrap">'
        '<header class="head"><div class="eyebrow">표본 %d건 · 무작위 추출</div>'
        "<h1>3D 유물 상세 뷰어에 쓸 메타데이터가 실제로 채워지는가</h1>"
        '<p class="sub">189 서버에 내려받혀 있는 유물 중 무작위 %d건을 뽑아 Sketchfab API 메타데이터를 '
        "수집했다. 상세 뷰어에 필요한 것은 썸네일·해설·분류이고, 목록에 노출할 한글명이 관건이다.</p></header>"
        '<dl class="stats">%s</dl>'
        '<p class="note"><b>판단 근거.</b> 썸네일과 해설문은 전량 확보된다 — 인터넷 검색 없이 API 만으로 '
        "상세 뷰어를 채울 수 있다는 뜻이다. 반면 한글명은 업로드 배치마다 설명문 양식이 달라 일부만 나온다. "
        "아래 카드에서 <b>한글명 결측</b> 표시가 붙은 것들이 별도 대책이 필요한 대상이다.</p>"
        '<div class="grid">%s</div></div>'
    ) % (CSS, n, n, "".join(stats), "".join(cards))

    os.makedirs(OUT_DIR, exist_ok=True)
    with io.open(OUT, "w", encoding="utf-8") as fh:
        fh.write(page)
    print("저장: %s (%.1f MB)" % (os.path.relpath(OUT, ROOT), os.path.getsize(OUT) / 1024 / 1024))


if __name__ == "__main__":
    main()
