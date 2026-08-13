#!/usr/bin/env node
/**
 * S7 빌드 + S8 릴리스 생성 — 운영 아키텍처 §4·§5.
 *
 * raw/{folder}/scene.gltf  →  build/{folder}/{scene.glb, scene.lod1.glb}
 *                          →  releases/rYYYYMMDD/asset/{folder}/…  + manifest.json
 *
 * 파이프라인은 A5 파일럿 실측으로 확정된 ETC1S 판이다(원안 UASTC는 전량 19.1GiB로 목표 미달):
 *   근거리 : copy → resize 2048 → etc1s q128 → meshopt high
 *   LOD1  : copy → simplify 0.1 → resize 256 → etc1s q100 → meshopt high
 *           (simplify만으로는 0.2%밖에 안 줄어든다 — 용량의 대부분이 텍스처이기 때문)
 *
 * 멱등: 원본보다 새 산출물이 이미 build/ 에 있으면 변환을 건너뛴다.
 *   node build_release.mjs            # 변경분만 빌드 후 릴리스 생성
 *   node build_release.mjs --rebuild  # 전량 재변환
 *   node build_release.mjs --limit 20 # 앞 20건만 (구성 검증용)
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = process.env.APP_ROOT || '/srv/joseon-time';
const RAW = path.join(ROOT, 'raw');
const BUILD = path.join(ROOT, 'build');
const RELEASES = path.join(ROOT, 'releases');
const DATA = path.join(ROOT, 'data');
const GT = process.env.GLTF_TRANSFORM || 'gltf-transform';

const args = process.argv.slice(2);
const REBUILD = args.includes('--rebuild');
const LIMIT = Number((args.find((a) => a.startsWith('--limit')) || '').split('=')[1] || args[args.indexOf('--limit') + 1] || 0);
const CONCURRENCY = Math.max(1, Math.min(os.cpus().length - 1, 8));

const log = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// GLTF_TRANSFORM_CLI_JS 를 주면 node 로 엔트리포인트를 직접 실행한다.
// (Windows 에서 홈 경로에 괄호가 있으면 .cmd 래퍼의 셸 파싱이 깨지는 문제 회피 — A5에서 확인)
const GT_CLI_JS = process.env.GLTF_TRANSFORM_CLI_JS || '';
async function gt(...argv) {
  // gltf-transform 은 텍스처 인코딩에 ktx CLI(KTX-Software)를 호출한다. 없으면 etc1s 단계가 실패한다.
  if (GT_CLI_JS) await run(process.execPath, [GT_CLI_JS, ...argv], { maxBuffer: 1 << 26 });
  else await run(GT, argv, { maxBuffer: 1 << 26 });
}

function newerThan(a, b) {
  try { return fs.statSync(a).mtimeMs >= fs.statSync(b).mtimeMs; } catch { return false; }
}

async function buildAsset(folder) {
  const src = path.join(RAW, folder, 'scene.gltf');
  if (!fs.existsSync(src)) return { folder, skipped: 'no scene.gltf' };

  const out = path.join(BUILD, folder);
  const near = path.join(out, 'scene.glb');
  const lod1 = path.join(out, 'scene.lod1.glb');
  if (!REBUILD && newerThan(near, src) && newerThan(lod1, src)) {
    return { folder, cached: true, nearBytes: fs.statSync(near).size, lod1Bytes: fs.statSync(lod1).size };
  }

  fs.mkdirSync(out, { recursive: true });
  const base = path.join(out, '_base.glb');
  const t0 = Date.now();
  try {
    await gt('copy', src, base);

    // 근거리
    await gt('resize', base, near, '--width', '2048', '--height', '2048');
    await gt('etc1s', near, near, '--quality', '128');
    await gt('meshopt', near, near, '--level', 'high');

    // 원거리 — 텍스처 축소가 핵심(A5)
    await gt('simplify', base, lod1, '--ratio', '0.1', '--error', '0.01');
    await gt('resize', lod1, lod1, '--width', '256', '--height', '256');
    await gt('etc1s', lod1, lod1, '--quality', '100');
    await gt('meshopt', lod1, lod1, '--level', 'high');

    fs.rmSync(base, { force: true });
    return {
      folder, seconds: +((Date.now() - t0) / 1000).toFixed(1),
      srcBytes: fs.statSync(src).size,
      nearBytes: fs.statSync(near).size,
      lod1Bytes: fs.statSync(lod1).size,
    };
  } catch (e) {
    return { folder, error: String(e.stderr || e.message).slice(0, 300) };
  }
}

async function pool(items, worker) {
  const out = new Array(items.length);
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < items.length) {
      const n = i++;
      out[n] = await worker(items[n]);
      if (++done % 25 === 0) log(`  ${done}/${items.length}`);
    }
  }));
  return out;
}

function nextReleaseId() {
  const d = new Date();
  const stamp = `r${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  let id = stamp, n = 1;
  while (fs.existsSync(path.join(RELEASES, id))) id = `${stamp}-${++n}`;
  return id;
}

function copyInto(srcFile, destFile) {
  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  fs.copyFileSync(srcFile, destFile);
  return sha256(fs.readFileSync(destFile));
}

async function main() {
  const catalogPath = path.join(DATA, 'assets.catalog.json');
  if (!fs.existsSync(catalogPath)) throw new Error(`카탈로그 없음: ${catalogPath}`);
  let folders = JSON.parse(fs.readFileSync(catalogPath, 'utf8')).assets.map((a) => a.folder);
  if (LIMIT) folders = folders.slice(0, LIMIT);
  log(`S7 빌드 시작 — ${folders.length}건, 동시 ${CONCURRENCY}`);

  const results = await pool(folders, buildAsset);
  const ok = results.filter((r) => r.nearBytes);
  const failed = results.filter((r) => r.error);
  const built = ok.filter((r) => !r.cached).length;
  log(`빌드 완료 — 성공 ${ok.length} (신규 변환 ${built}) · 실패 ${failed.length}`);
  for (const f of failed.slice(0, 10)) log(`  !! ${f.folder}: ${f.error}`);

  // ── S8 릴리스 조립 ──
  const id = nextReleaseId();
  const rel = path.join(RELEASES, id);
  log(`릴리스 조립 — ${id}`);
  const files = {};

  for (const r of ok) {
    for (const name of ['scene.glb', 'scene.lod1.glb']) {
      files[`asset/${r.folder}/${name}`] = copyInto(
        path.join(BUILD, r.folder, name), path.join(rel, 'asset', r.folder, name));
    }
  }

  // 데이터 파일 — 있는 것만 담는다(placements/provenance 는 큐레이션 진행에 따라 나중에 생긴다)
  for (const f of ['assets.catalog.json', 'classification.json', 'placements.json',
                   'provenance.json', 'heritage.features.geojson', 'ontology.json']) {
    const p = path.join(DATA, f);
    if (fs.existsSync(p)) files[`data/${f}`] = copyInto(p, path.join(rel, 'data', f));
  }

  // 프런트엔드 — config.js 는 서버 로컬본(ion 토큰·assetBase)을 넣는다
  for (const f of ['joseon_time.html', 'config.js']) {
    const p = path.join(ROOT, 'app', f);
    if (fs.existsSync(p)) files[f] = copyInto(p, path.join(rel, f));
    else log(`  ! ${f} 없음 — ${p} 에 배치하라`);
  }

  const prevId = fs.existsSync(path.join(RELEASES, 'current'))
    ? path.basename(fs.realpathSync(path.join(RELEASES, 'current'))) : null;
  const prev = prevId && fs.existsSync(path.join(RELEASES, prevId, 'manifest.json'))
    ? JSON.parse(fs.readFileSync(path.join(RELEASES, prevId, 'manifest.json'), 'utf8')).files : {};

  const added = Object.keys(files).filter((k) => !(k in prev));
  const updated = Object.keys(files).filter((k) => k in prev && prev[k] !== files[k]);
  const removed = Object.keys(prev).filter((k) => !(k in files));

  const totalBytes = ok.reduce((s, r) => s + r.nearBytes + r.lod1Bytes, 0);
  const manifest = {
    release: id,
    createdAt: new Date().toISOString(),
    pipeline: 'etc1s (A5 실측 확정판)',
    assetCount: ok.length,
    totalBytes,
    totalGiB: +(totalBytes / 1024 ** 3).toFixed(3),
    buildFailures: failed.map((f) => ({ folder: f.folder, error: f.error })),
    changesFromPrev: { prev: prevId, added: added.length, updated: updated.length, removed: removed.length },
    files,
  };
  fs.writeFileSync(path.join(rel, 'manifest.json'), JSON.stringify(manifest, null, 1));

  log(`릴리스 ${id} — 에셋 ${ok.length}건 · ${manifest.totalGiB} GiB · 변경 +${added.length}/~${updated.length}/-${removed.length}`);
  log(`다음: node secret_scan.mjs ${rel} && bash publish.sh ${id}`);
  console.log(JSON.stringify({ release: id, path: rel, ...manifest.changesFromPrev, totalGiB: manifest.totalGiB }));
}

main().catch((e) => { console.error(e); process.exit(1); });
