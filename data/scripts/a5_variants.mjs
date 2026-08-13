#!/usr/bin/env node
/**
 * A5 파일럿 보조 실험 — 텍스처 인코딩/해상도 변형 비교
 *
 * 기본 파이프라인(2048 + UASTC L2)이 근거리 ≤4MB 목표를 넘기는 원인이
 * 텍스처 데이터임을 확인했으므로, 목표를 만족하는 조합을 탐색한다.
 * LOD1 도 텍스처를 별도로 축소해야 ≤400KB 에 접근한다.
 *
 * 사용법: node a5_variants.mjs [folder ...]
 */
import { spawn } from 'node:child_process';
import { mkdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'C:\\project\\joseon_time';
const SRC_DIR = join(ROOT, 'heritage', 'asset');
const OUT_DIR = join(ROOT, 'build', 'a5_pilot', '_variants');
const NPM_BIN = join(process.env.APPDATA || '', 'npm');
const GLTF_CLI = join(NPM_BIN, 'node_modules', '@gltf-transform', 'cli', 'bin', 'cli.js');
const ENV = { ...process.env, PATH: `C:\\ktxsw\\bin;${NPM_BIN};${process.env.PATH}` };
const MiB = 1048576;

const run = (argv) =>
  new Promise((res) => {
    const t0 = Date.now();
    const ps = spawn(process.execPath, [GLTF_CLI, ...argv], { env: ENV, windowsHide: true });
    let err = '';
    ps.stdout.on('data', () => {});
    ps.stderr.on('data', (d) => (err += d));
    ps.on('close', (code) => res({ code, seconds: +((Date.now() - t0) / 1000).toFixed(1), err: err.slice(-600) }));
  });

const size = (p) => (existsSync(p) ? statSync(p).size : null);

// 변형: [id, 텍스처 해상도 상한, 인코딩 인자, 설명]
const VARIANTS = [
  { id: 'v0_2048_uastc2', res: 2048, enc: ['uastc', '--level', '2', '--zstd', '18'], desc: '기준 파이프라인 (설계서 §5 원안)' },
  { id: 'v1_2048_etc1s', res: 2048, enc: ['etc1s', '--quality', '128'], desc: '해상도 유지, ETC1S 로 교체' },
  { id: 'v2_1024_uastc2', res: 1024, enc: ['uastc', '--level', '2', '--zstd', '18'], desc: '해상도 1024, UASTC 유지' },
  { id: 'v3_1024_etc1s', res: 1024, enc: ['etc1s', '--quality', '128'], desc: '해상도 1024 + ETC1S' },
  { id: 'v4_512_etc1s', res: 512, enc: ['etc1s', '--quality', '128'], desc: '해상도 512 + ETC1S (근거리 하한 탐색)' },
];

// LOD1 변형: 지오메트리 단순화 + 텍스처 대폭 축소
const LOD1_VARIANTS = [
  { id: 'lod1_256_etc1s', res: 256, enc: ['etc1s', '--quality', '100'], ratio: '0.1', desc: 'simplify 0.1 + 256px ETC1S' },
  { id: 'lod1_128_etc1s', res: 128, enc: ['etc1s', '--quality', '100'], ratio: '0.1', desc: 'simplify 0.1 + 128px ETC1S' },
];

const folders = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['A_frame_Carrier', 'Gyeongbokgung_Sajeongjeon_Kings Chair', 'Tomb of King Seongdeok_Stone Guardian'];

const report = [];

for (const folder of folders) {
  const src = join(SRC_DIR, folder, 'scene.gltf');
  const work = join(OUT_DIR, folder.replace(/[^\w.-]/g, '_'));
  mkdirSync(work, { recursive: true });
  const base = join(work, 'base.glb');
  console.log(`\n=== ${folder} ===`);
  await run(['copy', src, base]);

  const entry = { folder, sourceBytes: size(base), nearVariants: [], lod1Variants: [] };

  for (const v of VARIANTS) {
    const rz = join(work, `${v.id}_rz.glb`);
    const enc = join(work, `${v.id}_enc.glb`);
    const fin = join(work, `${v.id}.glb`);
    const r1 = await run(['resize', base, rz, '--width', String(v.res), '--height', String(v.res)]);
    const r2 = await run([v.enc[0], rz, enc, ...v.enc.slice(1)]);
    const r3 = await run(['meshopt', existsSync(enc) ? enc : rz, fin, '--level', 'high']);
    const bytes = size(fin);
    const secs = +(r1.seconds + r2.seconds + r3.seconds).toFixed(1);
    const row = {
      id: v.id,
      desc: v.desc,
      resolution: v.res,
      encoder: v.enc[0],
      bytes,
      MiB: bytes ? +(bytes / MiB).toFixed(3) : null,
      seconds: secs,
      meetsNearTarget: bytes !== null ? bytes <= 4 * MiB : null,
      error: bytes === null ? (r2.err || r3.err || r1.err).trim().slice(0, 200) : undefined,
    };
    entry.nearVariants.push(row);
    console.log(`  ${v.id.padEnd(18)} ${row.MiB !== null ? String(row.MiB).padStart(8) + ' MB' : '   FAIL'}  ${secs}s  ${row.meetsNearTarget ? '<=4MB OK' : ''}`);
  }

  for (const v of LOD1_VARIANTS) {
    const sm = join(work, `${v.id}_sm.glb`);
    const rz = join(work, `${v.id}_rz.glb`);
    const fin = join(work, `${v.id}.glb`);
    const r1 = await run(['simplify', base, sm, '--ratio', v.ratio, '--error', '0.01']);
    const r2 = await run(['resize', existsSync(sm) ? sm : base, rz, '--width', String(v.res), '--height', String(v.res)]);
    const r3 = await run([v.enc[0], existsSync(rz) ? rz : sm, fin, ...v.enc.slice(1)]);
    const r4 = await run(['meshopt', existsSync(fin) ? fin : rz, fin.replace('.glb', '_mo.glb'), '--level', 'high']);
    const finalPath = existsSync(fin.replace('.glb', '_mo.glb')) ? fin.replace('.glb', '_mo.glb') : fin;
    const bytes = size(finalPath);
    const secs = +(r1.seconds + r2.seconds + r3.seconds + r4.seconds).toFixed(1);
    const row = {
      id: v.id,
      desc: v.desc,
      resolution: v.res,
      bytes,
      KiB: bytes ? +(bytes / 1024).toFixed(1) : null,
      seconds: secs,
      meetsLod1Target: bytes !== null ? bytes <= 400 * 1024 : null,
    };
    entry.lod1Variants.push(row);
    console.log(`  ${v.id.padEnd(18)} ${row.KiB !== null ? String(row.KiB).padStart(8) + ' KB' : '   FAIL'}  ${secs}s  ${row.meetsLod1Target ? '<=400KB OK' : ''}`);
  }

  report.push(entry);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'variants.json'), JSON.stringify(report, null, 2), 'utf8');
console.log('\n작성: ' + join(OUT_DIR, 'variants.json'));
