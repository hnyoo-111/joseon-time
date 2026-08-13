# -*- coding: utf-8 -*-
"""
data/korean-name-candidates.json 을 사람이 검수할 수 있는 단일 HTML 페이지로 변환한다.

출력: .omc/artifacts/korean-name-review.html
선택 상태는 브라우저 localStorage 에 저장되고, 하단 텍스트영역으로 내보내기/불러오기 한다.
"""

import sys
import json
import html
from collections import OrderedDict
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "korean-name-candidates.json"
OUT = ROOT / ".omc" / "artifacts" / "korean-name-review.html"

CSS = """
:root {
  color-scheme: light dark;
  --bg: #f6f6f4; --panel: #ffffff; --panel2: #fafaf8;
  --fg: #1b1b1a; --muted: #6b6b66; --line: #dedcd6;
  --accent: #7a4b2a; --accent-fg: #ffffff;
  --ok: #2f6b3a; --warn: #8a5a12; --none: #8a2f2f;
  --chip: #efece5;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #17171a; --panel: #1f1f23; --panel2: #26262b;
    --fg: #eceae4; --muted: #9d9a92; --line: #35353c;
    --accent: #d0a06a; --accent-fg: #1b1b1a;
    --ok: #7fc08d; --warn: #ddb057; --none: #e08a8a;
    --chip: #2d2d33;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 0 0 6rem;
  background: var(--bg); color: var(--fg);
  font: 15px/1.6 "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
}
header {
  position: sticky; top: 0; z-index: 10;
  background: var(--panel); border-bottom: 1px solid var(--line);
  padding: 14px 20px;
}
header h1 { margin: 0 0 4px; font-size: 18px; letter-spacing: -0.01em; }
.stats { color: var(--muted); font-size: 13px; }
.stats b { color: var(--fg); }
main { max-width: 1100px; margin: 0 auto; padding: 18px 20px; }
details.site {
  background: var(--panel); border: 1px solid var(--line);
  border-radius: 10px; margin-bottom: 14px; overflow: hidden;
}
details.site > summary {
  cursor: pointer; padding: 12px 16px; font-weight: 700;
  background: var(--panel2); list-style: none;
}
details.site > summary::-webkit-details-marker { display: none; }
details.site > summary::before { content: "▸ "; color: var(--muted); }
details.site[open] > summary::before { content: "▾ "; }
summary .count { font-weight: 400; color: var(--muted); font-size: 13px; margin-left: 8px; }
.cards { padding: 8px 12px 14px; display: grid; gap: 10px; }
.card {
  border: 1px solid var(--line); border-radius: 9px;
  background: var(--panel2); padding: 11px 13px;
}
.card.done { border-color: var(--ok); }
.card.empty { border-style: dashed; border-color: var(--none); }
.card h3 {
  margin: 0 0 8px; font-size: 14.5px; font-weight: 700;
  word-break: break-word; display: flex; gap: 8px; align-items: baseline;
  flex-wrap: wrap;
}
.chip {
  font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 20px;
  background: var(--chip); color: var(--muted);
}
.chip.auto { background: var(--ok); color: var(--accent-fg); }
.chip.none { background: var(--none); color: #fff; }
.opts { display: grid; gap: 5px; }
label.opt {
  display: flex; gap: 9px; align-items: flex-start;
  padding: 6px 9px; border-radius: 7px; cursor: pointer;
  border: 1px solid transparent;
}
label.opt:hover { background: var(--chip); }
label.opt:has(input:checked) { border-color: var(--accent); background: var(--chip); }
label.opt input { margin-top: 5px; accent-color: var(--accent); flex: none; }
.ko { font-weight: 600; }
.meta { color: var(--muted); font-size: 12px; }
.sc { font-variant-numeric: tabular-nums; color: var(--muted); font-size: 12px; }
.export { max-width: 1100px; margin: 0 auto; padding: 0 20px; }
textarea {
  width: 100%; height: 190px; font: 12px/1.5 Consolas, monospace;
  background: var(--panel); color: var(--fg);
  border: 1px solid var(--line); border-radius: 8px; padding: 10px;
}
button {
  font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
  background: var(--accent); color: var(--accent-fg);
  border: 0; border-radius: 7px; padding: 7px 14px; margin: 8px 6px 0 0;
}
button.ghost { background: transparent; color: var(--fg); border: 1px solid var(--line); }
.filters { margin-top: 8px; display: flex; gap: 14px; flex-wrap: wrap; font-size: 13px; }
.filters label { cursor: pointer; color: var(--muted); }
"""

JS = r"""
var KEY = 'joseon-korean-name-review';
var store = {};
try { store = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { store = {}; }

function cards() { return Array.prototype.slice.call(document.querySelectorAll('.card')); }

function paint(card) {
  var checked = card.querySelector('input:checked');
  card.classList.toggle('done', !!(checked && checked.value));
}

function refreshStats() {
  var done = cards().filter(function (c) {
    var i = c.querySelector('input:checked');
    return i && i.value;
  }).length;
  document.getElementById('doneCount').textContent = done;
}

function applyFilters() {
  var onlyTodo = document.getElementById('fTodo').checked;
  var onlyEmpty = document.getElementById('fEmpty').checked;
  cards().forEach(function (c) {
    var picked = c.classList.contains('done');
    var show = true;
    if (onlyTodo && picked) show = false;
    if (onlyEmpty && !c.classList.contains('empty')) show = false;
    c.style.display = show ? '' : 'none';
  });
  document.querySelectorAll('details.site').forEach(function (d) {
    var visible = Array.prototype.slice.call(d.querySelectorAll('.card'))
      .filter(function (c) { return c.style.display !== 'none'; }).length;
    d.style.display = visible ? '' : 'none';
  });
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(store));
  refreshStats();
  render();
}

function render() {
  var out = { generatedBy: 'korean-name-review.html', decisions: [] };
  cards().forEach(function (c) {
    var f = c.dataset.folder;
    var v = store[f];
    if (!v) return;
    out.decisions.push(v);
  });
  document.getElementById('exp').value = JSON.stringify(out, null, 2);
}

document.addEventListener('change', function (ev) {
  var input = ev.target;
  if (input.type === 'radio' && input.name.indexOf('pick:') === 0) {
    var card = input.closest('.card');
    var f = card.dataset.folder;
    if (input.value === '') {
      delete store[f];
    } else {
      store[f] = {
        folder: f,
        relicNm: input.dataset.ko,
        khsUid: input.dataset.uid,
        hrtgNm: input.dataset.hrtg,
        score: parseFloat(input.dataset.score)
      };
    }
    paint(card);
    save();
    applyFilters();
  }
  if (input.id === 'fTodo' || input.id === 'fEmpty') applyFilters();
});

document.addEventListener('DOMContentLoaded', function () {
  cards().forEach(function (card) {
    var v = store[card.dataset.folder];
    if (!v) return;
    var hit = card.querySelector('input[data-uid="' + v.khsUid + '"]');
    if (hit) { hit.checked = true; paint(card); }
  });
  refreshStats();
  render();

  document.getElementById('copy').addEventListener('click', function () {
    var ta = document.getElementById('exp');
    ta.select();
    navigator.clipboard.writeText(ta.value).then(function () {
      this.textContent = '복사됨';
      setTimeout(function () { document.getElementById('copy').textContent = 'JSON 복사'; }, 1200);
    }.bind(this), function () { document.execCommand('copy'); });
  });

  document.getElementById('load').addEventListener('click', function () {
    try {
      var data = JSON.parse(document.getElementById('exp').value);
      store = {};
      (data.decisions || []).forEach(function (d) { store[d.folder] = d; });
      cards().forEach(function (card) {
        card.querySelectorAll('input').forEach(function (i) { i.checked = false; });
        var v = store[card.dataset.folder];
        var hit = v && card.querySelector('input[data-uid="' + v.khsUid + '"]');
        if (hit) hit.checked = true;
        paint(card);
      });
      save();
      applyFilters();
      alert('불러오기 완료: ' + Object.keys(store).length + '건');
    } catch (e) {
      alert('JSON 파싱 실패: ' + e.message);
    }
  });

  document.getElementById('acceptAuto').addEventListener('click', function () {
    cards().forEach(function (card) {
      if (card.dataset.auto !== '1') return;
      if (store[card.dataset.folder]) return;
      var first = card.querySelector('input[data-uid]');
      if (first) { first.checked = true; first.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  });

  document.getElementById('reset').addEventListener('click', function () {
    if (!confirm('선택을 모두 지웁니다. 계속할까요?')) return;
    store = {};
    cards().forEach(function (card) {
      card.querySelectorAll('input').forEach(function (i) { i.checked = false; });
      paint(card);
    });
    save();
    applyFilters();
  });
});
"""


def esc(s):
    return html.escape(str(s if s is not None else ""), quote=True)


def main():
    data = json.loads(SRC.read_text(encoding="utf-8"))
    folders = data["folders"]
    summary = data["summary"]

    groups = OrderedDict()
    for f in folders:
        key = f["site"] or "(사이트 없음 · D류 단독 유물)"
        groups.setdefault(key, []).append(f)
    # 항목이 많은 사이트부터
    ordered = sorted(groups.items(), key=lambda kv: -len(kv[1]))

    parts = []
    for site, items in ordered:
        empty_n = sum(1 for i in items if not i["candidates"])
        auto_n = sum(1 for i in items if i["autoAccept"])
        parts.append(
            '<details class="site"%s><summary>%s'
            '<span class="count">%d건 · 자동추천 %d · 후보없음 %d</span></summary>'
            '<div class="cards">'
            % (" open" if len(items) <= 60 else "", esc(site), len(items), auto_n, empty_n))

        for it in items:
            chips = []
            if it.get("class"):
                chips.append('<span class="chip">%s류</span>' % esc(it["class"]))
            if it["autoAccept"]:
                chips.append('<span class="chip auto">자동추천</span>')
            if not it["candidates"]:
                chips.append('<span class="chip none">후보 없음</span>')
            if it.get("knownNameKo"):
                chips.append('<span class="chip">확인된 한글명: %s</span>'
                             % esc(it["knownNameKo"]))

            opts = []
            name = "pick:" + it["folder"]
            for c in it["candidates"]:
                opts.append(
                    '<label class="opt"><input type="radio" name="%s" value="1"'
                    ' data-uid="%s" data-ko="%s" data-hrtg="%s" data-score="%s">'
                    '<span><span class="ko">%s</span> <span class="sc">%.2f</span>'
                    '<br><span class="meta">%s%s · %s</span></span></label>'
                    % (esc(name), esc(c["khsUid"]), esc(c["relicNm"]), esc(c["hrtgNm"]),
                       c["score"], esc(c["relicNm"]), c["score"],
                       esc(c["hrtgNm"] or "소속 미상"),
                       " · " + esc(c.get("assetSe")) if c.get("assetSe") else "",
                       esc(c["why"])))
            opts.append(
                '<label class="opt"><input type="radio" name="%s" value="">'
                '<span class="meta">해당 없음 / 보류</span></label>' % esc(name))

            parts.append(
                '<div class="card%s" data-folder="%s" data-auto="%s">'
                '<h3>%s %s</h3><div class="opts">%s</div></div>'
                % (" empty" if not it["candidates"] else "",
                   esc(it["folder"]), "1" if it["autoAccept"] else "0",
                   esc(it["folder"]), " ".join(chips), "".join(opts)))

        parts.append("</div></details>")

    page = """<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>한글 유물명 매칭 검수</title>
<style>%s</style></head><body>
<header>
  <h1>한글 유물명 매칭 검수</h1>
  <div class="stats">
    전체 <b>%d</b>건 · 후보 있음 <b>%d</b> · 자동추천 <b>%d</b> · 선택 완료 <b id="doneCount">0</b>
    · KHS 후보 풀 %d건
  </div>
  <div class="filters">
    <label><input type="checkbox" id="fTodo"> 미선택만 보기</label>
    <label><input type="checkbox" id="fEmpty"> 후보 없음만 보기</label>
  </div>
</header>
<main>%s</main>
<div class="export">
  <h2 style="font-size:15px;margin-bottom:6px">선택 결과 JSON</h2>
  <textarea id="exp" spellcheck="false"></textarea>
  <button id="copy">JSON 복사</button>
  <button id="load" class="ghost">붙여넣은 JSON 불러오기</button>
  <button id="acceptAuto" class="ghost">자동추천 일괄 선택</button>
  <button id="reset" class="ghost">선택 초기화</button>
</div>
<script>%s</script>
</body></html>""" % (CSS, summary["totalFolders"], summary["withCandidates"],
                     summary["autoAccept"], summary["khsPoolSize"],
                     "".join(parts), JS)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page, encoding="utf-8")
    print("검수 페이지 생성: %s (%.0f KB, 사이트 섹션 %d개)"
          % (OUT, OUT.stat().st_size / 1024, len(ordered)))


if __name__ == "__main__":
    main()
