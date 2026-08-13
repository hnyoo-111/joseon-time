#!/usr/bin/env node
/**
 * A5 에셋 최적화 파일럿 (설계서 §5)
 *
 * heritage/asset/<folder>/scene.gltf 를 읽어 build/a5_pilot/<folder>/ 에
 * 근거리용 scene.glb 와 원거리용 scene.lod1.glb 를 생성하고,
 * 단계별 산출 크기·소요 시간을 계측한다. 원본은 읽기만 한다.
 *
 * 사용법:
 *   node a5_pilot.mjs                 # 기본 5건 전부
 *   node a5_pilot.mjs --only "Bowl"   # 특정 폴더만 (반복 지정 가능)
 *   node a5_pilot.mjs --skip-big      # 500MB 초과 에셋 제외
 *   node a5_pilot.mjs --uastc-level 4 # UASTC level 변경 (기본 2)
 */
import { spawn } from 'node:child_process';
import { mkdirSync, statSync, existsSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = 'C:\\project\\joseon_time';
const SRC_DIR = join(ROOT, 'heritage', 'asset');
const BUILD_DIR = join(ROOT, 'build', 'a5_pilot');
const RESULT_DIR = join(BUILD_DIR, '_results');
const KTX_BIN = 'C:\\ktxsw\\bin';
const NPM_BIN = join(process.env.APPDATA || '', 'npm');

// gltf-transform / ktx 를 찾을 수 있도록 PATH 보강
const ENV = { ...process.env, PATH: `${KTX_BIN};${NPM_BIN};${process.env.PATH}` };

// .cmd 셸 래퍼는 홈 경로의 괄호(`조건희(GeonheeJo)`)에서 파싱이 깨지므로
// node 로 CLI 엔트리포인트를 직접 실행한다 (shell:false).
const GLTF_CLI = join(NPM_BIN, 'node_modules', '@gltf-transform', 'cli', 'bin', 'cli.js');

// ── 대표 5건 (선정 근거는 report 에 함께 기록) ──────────────────────────────
const ASSETS = [
  {
    folder: 'Bowl',
    class: 'D',
    role: 'min',
    reason: '카탈로그 전체 최소 용량(0.13MB). 소형 기물의 하한 케이스 — 압축 오버헤드가 이득을 넘어서는지 확인',
  },
  {
    folder: 'A_frame_Carrier',
    class: 'D',
    role: 'median',
    reason: '506건 크기 정렬 시 중앙값 위치(index 252, 13.60MB). 전체 분포의 대표값',
  },
  {
    folder: 'Gyeongbokgung_Sajeongjeon_Kings Chair',
    class: 'C',
    role: 'class-C',
    reason: 'C클래스(실내 기물) 158건의 중앙값(21.56MB)이자 Gyeongbokgung_* 계열 실내 가구',
  },
  {
    folder: 'Tomb of King Seongdeok_Stone Guardian',
    class: 'B',
    role: 'class-B',
    reason: 'B클래스(능묘 석물) 45건의 중앙값(116.31MB). 포토그래메트리 고밀도 메시 + 대형 텍스처',
  },
  {
    folder: 'Chunyanggyo West Gate Gyeongju',
    class: 'A',
    role: 'max',
    reason: '카탈로그 전체 최대 용량(1405.76MB). 파이프라인 상한 스트레스 및 빌드 시간 상한 측정',
  },
];

// ── 유틸 ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const only = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--only') only.push(args[++i]);
}
const skipBig = args.includes('--skip-big');
const uastcLevel = args.includes('--uastc-level') ? args[args.indexOf('--uastc-level') + 1] : '2';

const dirSize = (dir) => {
  let total = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    total += e.isDirectory() ? dirSize(p) : statSync(p).size;
  }
  return total;
};

const fileSize = (p) => (existsSync(p) ? statSync(p).size : null);

function run(argv, { capture = false } = {}) {
  return new Promise((res) => {
    const t0 = Date.now();
    const ps = spawn(process.execPath, [GLTF_CLI, ...argv], { env: ENV, shell: false, windowsHide: true });
    let out = '';
    let err = '';
    if (capture) ps.stdout.on('data', (d) => (out += d));
    else ps.stdout.on('data', () => {});
    ps.stderr.on('data', (d) => (err += d));
    ps.on('close', (code) => {
      res({ code, seconds: +((Date.now() - t0) / 1000).toFixed(1), stdout: out, stderr: err.slice(-2000) });
    });
    ps.on('error', (e) => {
      res({ code: -1, seconds: +((Date.now() - t0) / 1000).toFixed(1), stdout: '', stderr: String(e) });
    });
  });
}

// inspect 출력에서 텍스처 포맷·프리미티브 수 추출
function parseInspect(text) {
  const clean = text.replace(/\u001b\[[0-9;]*m/g, '');
  const formats = {};
  for (const m of clean.matchAll(/\b(image\/(?:png|jpeg|webp|ktx2))\b/g)) {
    formats[m[1]] = (formats[m[1]] || 0) + 1;
  }
  // KTX2 는 mimeType 대신 확장자로 표기되기도 함
  for (const m of clean.matchAll(/\.ktx2\b/g)) formats['ktx2'] = (formats['ktx2'] || 0) + 1;
  // 표 한 줄을 세로줄로 분해해 셀 배열로 만들고, 헤더에서 열 위치를 찾아 값을 읽는다.
  const SEP = '│';
  const cells = (line) =>
    line
      .split(SEP)
      .map((c) => c.trim())
      .filter((c, i, arr) => !((i === 0 || i === arr.length - 1) && c === ''));

  const table = (name) => {
    const lines = clean.split('\n');
    const start = lines.findIndex((l) => l.trim() === name);
    if (start < 0) return null;
    const body = [];
    for (let i = start + 1; i < lines.length; i++) {
      if (/^\s*[A-Z]{3,}\s*$/.test(lines[i])) break;
      if (lines[i].includes(SEP)) body.push(lines[i]);
    }
    if (!body.length) return null;
    return {
      header: cells(body[0]),
      rows: body.slice(1).map(cells).filter((r) => /^\d+$/.test(r[0] || '')),
    };
  };

  const num = (v) => parseInt(String(v).replace(/,/g, ''), 10) || 0;

  let meshes = null;
  const mt = table('MESHES');
  if (mt) {
    const sum = (n) => {
      const i = mt.header.indexOf(n);
      return i < 0 ? null : mt.rows.reduce((s, r) => s + num(r[i]), 0);
    };
    meshes = {
      meshCount: mt.rows.length,
      meshPrimitives: sum('meshPrimitives'),
      glPrimitives: sum('glPrimitives'),
      vertices: sum('vertices'),
    };
  }

  let textures = null;
  const tt = table('TEXTURES');
  if (tt) {
    const uniq = (n) => {
      const i = tt.header.indexOf(n);
      return i < 0 ? [] : [...new Set(tt.rows.map((r) => r[i]).filter(Boolean))];
    };
    textures = {
      textureCount: tt.rows.length,
      resolutions: uniq('resolution'),
      compressions: uniq('compression'),
    };
  }

  return { textureFormats: formats, meshes, textures };
}

// ── 파이프라인 ──────────────────────────────────────────────────────────────
async function processAsset(a) {
  const src = join(SRC_DIR, a.folder);
  const work = join(BUILD_DIR, a.folder);
  mkdirSync(work, { recursive: true });

  const rec = {
    ...a,
    sourceDir: src,
    workDir: work,
    sourceBytes: dirSize(src),
    steps: [],
    errors: [],
    startedAt: new Date().toISOString(),
  };
  console.log(`\n=== [${a.role}] ${a.folder}  (${(rec.sourceBytes / 1048576).toFixed(2)} MB) ===`);

  const srcGltf = join(src, 'scene.gltf');
  const p1 = join(work, 's1_copy.glb');
  const p2 = join(work, 's2_resize.glb');
  const p3 = join(work, 's3_tex.glb');
  const pFinal = join(work, 'scene.glb');
  const pLod1 = join(work, 'scene.lod1.glb');

  // 현재까지 성공한 마지막 산출물 (단계 실패 시 이어받기 위함)
  let cur = srcGltf;

  const step = async (name, argv, outPath, meta = {}) => {
    console.log(`  - ${name} ...`);
    const r = await run(argv);
    const bytes = fileSize(outPath);
    const ok = r.code === 0 && bytes !== null;
    const s = { step: name, ok, seconds: r.seconds, outBytes: bytes, command: `gltf-transform ${argv.join(' ')}`, ...meta };
    if (!ok) {
      s.error = r.stderr.trim().split('\n').slice(-6).join(' | ');
      rec.errors.push(`${name}: ${s.error}`);
      console.log(`    FAILED (${r.seconds}s) ${s.error.slice(0, 200)}`);
    } else {
      cur = outPath;
      console.log(`    ok ${(bytes / 1048576).toFixed(2)} MB  ${r.seconds}s`);
    }
    rec.steps.push(s);
    return ok;
  };

  // a. copy — 단일 .glb 로 통합
  await step('a_copy', ['copy', cur, p1], p1);

  // b. resize — 텍스처 2048 상한
  await step('b_resize', ['resize', cur, p2, '--width', '2048', '--height', '2048'], p2);

  // c. 텍스처 압축 — KTX2(UASTC), 실패 시 webp 폴백
  const uastcArgs = ['uastc', cur, p3, '--level', uastcLevel, '--zstd', '18'];
  let texOk = await step('c_texture_ktx2', uastcArgs, p3, { encoder: `uastc level=${uastcLevel} zstd=18` });
  if (!texOk) {
    console.log('    → webp 폴백 시도');
    texOk = await step('c_texture_webp_fallback', ['webp', cur, p3, '--quality', '80'], p3, {
      encoder: 'webp q80',
      note: 'KTX2 실패로 대체됨',
    });
  }

  // d. meshopt — 실패 시 draco 폴백
  let meshOk = await step('d_meshopt', ['meshopt', cur, pFinal, '--level', 'high'], pFinal);
  if (!meshOk) {
    console.log('    → draco 폴백 시도');
    meshOk = await step('d_draco_fallback', ['draco', cur, pFinal], pFinal, { note: 'meshopt 실패로 대체됨' });
  }

  // e. LOD1 — 최종 근거리 산출물에서 단순화
  if (existsSync(pFinal)) {
    await step('e_lod1_simplify', ['simplify', pFinal, pLod1, '--ratio', '0.1', '--error', '0.01'], pLod1);
  } else {
    rec.errors.push('e_lod1_simplify: 근거리 scene.glb 부재로 스킵');
  }

  // 최종 검증
  rec.finalBytes = fileSize(pFinal);
  rec.lod1Bytes = fileSize(pLod1);
  rec.totalSeconds = +rec.steps.reduce((s, x) => s + x.seconds, 0).toFixed(1);
  rec.reductionRatio = rec.finalBytes ? +(1 - rec.finalBytes / rec.sourceBytes).toFixed(4) : null;
  rec.lod1ReductionRatio = rec.lod1Bytes ? +(1 - rec.lod1Bytes / rec.sourceBytes).toFixed(4) : null;
  rec.meetsNearTarget = rec.finalBytes !== null ? rec.finalBytes <= 4 * 1048576 : null;
  rec.meetsLod1Target = rec.lod1Bytes !== null ? rec.lod1Bytes <= 400 * 1024 : null;

  for (const [label, p] of [['final', pFinal], ['lod1', pLod1]]) {
    if (!existsSync(p)) continue;
    const r = await run(['inspect', p], { capture: true });
    rec[`inspect_${label}`] = r.code === 0 ? parseInspect(r.stdout) : { error: r.stderr.slice(-400) };
  }

  rec.finishedAt = new Date().toISOString();
  mkdirSync(RESULT_DIR, { recursive: true });
  writeFileSync(join(RESULT_DIR, `${a.folder.replace(/[^\w.-]/g, '_')}.json`), JSON.stringify(rec, null, 2));
  console.log(
    `  => 근거리 ${rec.finalBytes ? (rec.finalBytes / 1048576).toFixed(2) + 'MB' : 'N/A'} / ` +
      `LOD1 ${rec.lod1Bytes ? (rec.lod1Bytes / 1024).toFixed(0) + 'KB' : 'N/A'} / ` +
      `감축 ${rec.reductionRatio !== null ? (rec.reductionRatio * 100).toFixed(1) + '%' : 'N/A'} / ${rec.totalSeconds}s`
  );
  return rec;
}

// ── 실행 ────────────────────────────────────────────────────────────────────
const catalog = JSON.parse(readFileSync(join(ROOT, 'data', 'assets.catalog.json'), 'utf8')).assets;
const sizeOf = Object.fromEntries(catalog.map((a) => [a.folder, a.sizeBytes]));

let targets = ASSETS;
if (only.length) targets = targets.filter((a) => only.includes(a.folder));
if (skipBig) targets = targets.filter((a) => (sizeOf[a.folder] || 0) <= 500 * 1048576);
// 작은 것부터 처리해 조기에 수치를 확보
targets = [...targets].sort((a, b) => (sizeOf[a.folder] || 0) - (sizeOf[b.folder] || 0));

// --reinspect: 파이프라인을 다시 돌리지 않고, 이미 만들어진 산출물에 대해
// inspect 만 재실행해 결과 JSON 의 inspect_* 필드를 갱신한다.
if (args.includes('--reinspect')) {
  for (const a of targets) {
    const file = join(RESULT_DIR, `${a.folder.replace(/[^\w.-]/g, '_')}.json`);
    if (!existsSync(file)) continue;
    const rec = JSON.parse(readFileSync(file, 'utf8'));
    for (const [label, name] of [['final', 'scene.glb'], ['lod1', 'scene.lod1.glb']]) {
      const p = join(BUILD_DIR, a.folder, name);
      if (!existsSync(p)) continue;
      const r = await run(['inspect', p], { capture: true });
      rec[`inspect_${label}`] = r.code === 0 ? parseInspect(r.stdout) : { error: r.stderr.slice(-400) };
    }
    writeFileSync(file, JSON.stringify(rec, null, 2));
    const m = rec.inspect_final && rec.inspect_final.meshes;
    const t = rec.inspect_final && rec.inspect_final.textures;
    console.log(
      `${a.folder}: 메시 ${m ? m.meshCount : '?'}개 / 프리미티브 ${m ? m.meshPrimitives : '?'} / ` +
        `삼각형 ${m ? m.glPrimitives : '?'} / 텍스처 ${t ? t.textureCount : '?'}장 ${t ? t.compressions.join(',') : ''}`
    );
  }
  console.log('\nreinspect 완료.');
  process.exit(0);
}

console.log(`대상 ${targets.length}건: ${targets.map((t) => t.folder).join(', ')}`);
mkdirSync(RESULT_DIR, { recursive: true });

for (const a of targets) {
  try {
    await processAsset(a);
  } catch (e) {
    console.log(`ASSET FAILED ${a.folder}: ${e.message}`);
    writeFileSync(join(RESULT_DIR, `${a.folder.replace(/[^\w.-]/g, '_')}.error.json`), JSON.stringify({ folder: a.folder, fatal: String(e) }, null, 2));
  }
}
console.log('\n완료. 결과 조각: ' + RESULT_DIR);
