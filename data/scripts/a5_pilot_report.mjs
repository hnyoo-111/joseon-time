#!/usr/bin/env node
/**
 * A5 파일럿 결과 집계 + 506건 전체 추정
 *
 * 입력: build/a5_pilot/_results/*.json      (a5_pilot.mjs — 기준 파이프라인 실측)
 *       build/a5_pilot/_variants/variants.json (a5_variants.mjs — 인코딩 변형 실측)
 * 출력: data/a5-optimization-pilot-report.json
 *
 * 두 시나리오를 각각 추정한다.
 *   baseline    : 설계서 §5 원안 (2048 + UASTC L2 + zstd18)
 *   recommended : 2048 + ETC1S (근거리), simplify 0.1 + 256px ETC1S (LOD1)
 *
 * 추정 방식: 원본 크기 구간(bucket)별로 로그-크기 최근접 실측 샘플의
 * 감축률·처리속도를 대입해 506건을 합산한다.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'C:\\project\\joseon_time';
const RESULT_DIR = join(ROOT, 'build', 'a5_pilot', '_results');
const VARIANT_FILE = join(ROOT, 'build', 'a5_pilot', '_variants', 'variants.json');
const OUT = join(ROOT, 'data', 'a5-optimization-pilot-report.json');
const MiB = 1048576;
const GiB = 1073741824;

const catalog = JSON.parse(readFileSync(join(ROOT, 'data', 'assets.catalog.json'), 'utf8'));
const classification = JSON.parse(readFileSync(join(ROOT, 'data', 'classification.json'), 'utf8'));
const clsOf = Object.fromEntries(classification.assets.map((a) => [a.folder, a.class]));

const results = existsSync(RESULT_DIR)
  ? readdirSync(RESULT_DIR)
      .filter((f) => f.endsWith('.json') && !f.endsWith('.error.json'))
      .map((f) => JSON.parse(readFileSync(join(RESULT_DIR, f), 'utf8')))
      .sort((a, b) => a.sourceBytes - b.sourceBytes)
  : [];
if (!results.length) {
  console.error('파일럿 결과가 없습니다: ' + RESULT_DIR);
  process.exit(1);
}

const variants = existsSync(VARIANT_FILE) ? JSON.parse(readFileSync(VARIANT_FILE, 'utf8')) : [];

// ── 크기 구간 ───────────────────────────────────────────────────────────────
const BUCKETS = [
  { id: '0-1MB', lo: 0, hi: 1 },
  { id: '1-5MB', lo: 1, hi: 5 },
  { id: '5-20MB', lo: 5, hi: 20 },
  { id: '20-100MB', lo: 20, hi: 100 },
  { id: '100-500MB', lo: 100, hi: 500 },
  { id: '500MB+', lo: 500, hi: Infinity },
];

// ── 시나리오별 샘플 집합 ────────────────────────────────────────────────────
// baseline: a5_pilot.mjs 실측 (근거리 = scene.glb, LOD1 = scene.lod1.glb)
const baselineSamples = results
  .filter((r) => r.finalBytes)
  .map((r) => ({
    folder: r.folder,
    sizeMiB: r.sourceBytes / MiB,
    nearRatio: r.finalBytes / r.sourceBytes,
    lod1Ratio: r.lod1Bytes ? r.lod1Bytes / r.sourceBytes : null,
    secPerMiB: r.totalSeconds / (r.sourceBytes / MiB),
  }));

// recommended: a5_variants.mjs 실측 (v1_2048_etc1s + lod1_256_etc1s)
const recommendedSamples = variants
  .map((v) => {
    const near = (v.nearVariants || []).find((x) => x.id === 'v1_2048_etc1s' && x.bytes);
    const lod1 = (v.lod1Variants || []).find((x) => x.id === 'lod1_256_etc1s' && x.bytes);
    if (!near) return null;
    return {
      folder: v.folder,
      sizeMiB: v.sourceBytes / MiB,
      nearRatio: near.bytes / v.sourceBytes,
      lod1Ratio: lod1 ? lod1.bytes / v.sourceBytes : null,
      nearBytes: near.bytes,
      lod1Bytes: lod1 ? lod1.bytes : null,
      secPerMiB: (near.seconds + (lod1 ? lod1.seconds : 0)) / (v.sourceBytes / MiB),
    };
  })
  .filter(Boolean);

function pickSample(bucket, samples) {
  const hi = bucket.hi === Infinity ? bucket.lo * 3 : bucket.hi;
  const mid = Math.sqrt(Math.max(bucket.lo, 0.05) * hi);
  let best = null;
  let bestD = Infinity;
  for (const s of samples) {
    const d = Math.abs(Math.log(s.sizeMiB) - Math.log(mid));
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return { sample: best, bucketMidMiB: +mid.toFixed(2), logDistance: +bestD.toFixed(3) };
}

const assets = catalog.assets.map((a) => ({ ...a, cls: clsOf[a.folder] }));
const srcTotal = assets.reduce((s, a) => s + a.sizeBytes, 0);

function estimate(samples, label) {
  if (!samples.length) return { scenario: label, available: false, note: '실측 샘플 없음' };
  let near = 0;
  let lod1 = 0;
  let secs = 0;
  const rows = BUCKETS.map((b) => {
    const members = assets.filter((a) => {
      const m = a.sizeBytes / MiB;
      return m >= b.lo && m < b.hi;
    });
    const srcBytes = members.reduce((s, a) => s + a.sizeBytes, 0);
    const { sample, bucketMidMiB, logDistance } = pickSample(b, samples);
    const n = srcBytes * sample.nearRatio;
    const l = sample.lod1Ratio !== null ? srcBytes * sample.lod1Ratio : 0;
    const t = members.reduce((s, a) => s + (a.sizeBytes / MiB) * sample.secPerMiB, 0);
    near += n;
    lod1 += l;
    secs += t;
    return {
      bucket: b.id,
      assetCount: members.length,
      sourceGiB: +(srcBytes / GiB).toFixed(3),
      representativeSample: sample.folder,
      bucketMidMiB,
      sampleLogDistance: logDistance,
      measuredNearRatio: +sample.nearRatio.toFixed(4),
      measuredLod1Ratio: sample.lod1Ratio !== null ? +sample.lod1Ratio.toFixed(5) : null,
      measuredSecPerMiB: +sample.secPerMiB.toFixed(3),
      estimatedNearGiB: +(n / GiB).toFixed(3),
      estimatedLod1GiB: +(l / GiB).toFixed(3),
      estimatedSeconds: Math.round(t),
    };
  });
  return {
    scenario: label,
    available: true,
    sampleFolders: samples.map((s) => s.folder),
    buckets: rows,
    estimatedNearFieldGiB: +(near / GiB).toFixed(2),
    estimatedLod1GiB: +(lod1 / GiB).toFixed(3),
    estimatedCombinedGiB: +((near + lod1) / GiB).toFixed(2),
    estimatedReductionPercent: +((1 - (near + lod1) / srcTotal) * 100).toFixed(2),
    meetsTotalTarget: near + lod1 <= 2 * GiB,
    estimatedBuildSeconds: Math.round(secs),
    estimatedBuildHours: +(secs / 3600).toFixed(2),
    estimatedBuildHoursParallel4: +(secs / 3600 / 4).toFixed(2),
  };
}

// ── 에셋별 ≤4MB 달성 위험 분석 ──────────────────────────────────────────────
// ETC1S@2048 산출 크기는 원본 용량보다 "텍스처 장수"에 훨씬 강하게 비례한다.
// 파일럿 샘플에서 장당 단가를 구해, 506건 각각의 근거리 크기를 추정한다.
function perAssetTargetRisk() {
  const priced = variants
    .map((v) => {
      const near = (v.nearVariants || []).find((x) => x.id === 'v1_2048_etc1s' && x.bytes);
      const c = catalog.assets.find((a) => a.folder === v.folder);
      return near && c && c.texturesCount ? { bytes: near.bytes, textures: c.texturesCount, folder: v.folder } : null;
    })
    .filter(Boolean);
  if (!priced.length) return null;

  const totalBytes = priced.reduce((s, p) => s + p.bytes, 0);
  const totalTex = priced.reduce((s, p) => s + p.textures, 0);
  const meanPerTexture = totalBytes / totalTex;
  const maxPerTexture = Math.max(...priced.map((p) => p.bytes / p.textures));

  const rows = catalog.assets.map((a) => ({
    folder: a.folder,
    cls: clsOf[a.folder],
    texturesCount: a.texturesCount,
    estMeanBytes: a.texturesCount * meanPerTexture,
    estWorstBytes: a.texturesCount * maxPerTexture,
  }));
  const over = (key) => rows.filter((r) => r[key] > 4 * MiB);
  const overMean = over('estMeanBytes');

  return {
    model: '근거리 추정 = 텍스처 장수 x 장당 단가(ETC1S@2048 실측)',
    meanBytesPerTexture: Math.round(meanPerTexture),
    meanMiBPerTexture: +(meanPerTexture / MiB).toFixed(3),
    worstMiBPerTexture: +(maxPerTexture / MiB).toFixed(3),
    samplesUsed: priced.map((p) => ({ folder: p.folder, textures: p.textures, MiB: +(p.bytes / MiB).toFixed(3) })),
    textureCountDistribution: [
      [1, 3],
      [3, 6],
      [6, 12],
      [12, 30],
      [30, Infinity],
    ].map(([lo, hi]) => ({
      range: hi === Infinity ? `${lo}+` : `${lo}-${hi}`,
      assetCount: catalog.assets.filter((a) => a.texturesCount >= lo && a.texturesCount < hi).length,
    })),
    estimatedOver4MB_meanPricing: overMean.length,
    estimatedOver4MB_worstPricing: over('estWorstBytes').length,
    estimatedOver4MB_percent: +((overMean.length / catalog.assets.length) * 100).toFixed(1),
    worstOffenders: rows
      .sort((a, b) => b.estMeanBytes - a.estMeanBytes)
      .slice(0, 12)
      .map((r) => ({
        folder: r.folder,
        class: r.cls,
        texturesCount: r.texturesCount,
        estimatedNearMiB: +(r.estMeanBytes / MiB).toFixed(2),
      })),
    note:
      '텍스처 장수가 많은 대형 A클래스 건축물은 텍스처 압축만으로는 개별 4MB 예산을 맞출 수 없다. ' +
      'gltf-transform join/dedup 로 머티리얼·텍스처를 병합하거나(아틀라스화), 건물 단위를 청크로 분할하거나, ' +
      '해당 군에는 별도 예산(예: 환경 에셋 40MB)을 두는 설계 결정이 필요하다.',
  };
}

const report = {
  generatedBy: 'data/scripts/a5_pilot_report.mjs',
  generatedAt: new Date().toISOString(),
  designTargets: {
    nearFieldMaxBytes: 4 * MiB,
    lod1MaxBytes: 400 * 1024,
    totalTargetGiB: 2,
    note: '설계서 §5 기준. 근거리 ≤4MB, 원거리(LOD1) ≤400KB, 전체 ~2GB',
  },
  toolVersions: {
    node: process.version,
    'gltf-transform': '4.4.2',
    'KTX-Software': 'v4.4.2 (ktx.exe / toktx.exe)',
    sharp: '0.35.3',
    ktxInstallPath: 'C:\\ktxsw\\bin',
    ktxAcquired: true,
    ktxAcquisitionNote:
      'winget 에 패키지 없음. GitHub 공식 릴리스(KTX-Software-4.4.2-Windows-x64.exe, NSIS)를 받아 /S /D=C:\\ktxsw 로 무인 설치. gltf-transform 4.x 는 toktx 가 아니라 ktx CLI 를 호출한다.',
  },
  environmentFixes: [
    {
      issue: 'gltf-transform resize 단계가 libvips 오류로 전면 실패 (colourspace: parameter space not set)',
      cause:
        '@gltf-transform/cli 안에 sharp 0.34.5(libvips 8.17.3)와 ndarray-pixels 의 중첩 sharp 0.35.3(libvips 8.18.3)이 공존. 두 네이티브 애드온이 동일 이름 libvips-42.dll 을 로드해 먼저 로드된 8.17.3 이 승리, 8.18.3 용 enum 값(32)이 범위를 벗어남.',
      fix: 'CLI 패키지에서 npm install sharp@0.35.3 --no-save 로 단일 버전 통일 (중첩 사본 제거됨)',
      impact: '해당 조치 전에는 resize 단계가 100% 실패했다. 재현 환경 구축 시 반드시 필요.',
    },
    {
      issue: 'gltf-transform.cmd 실행 실패',
      cause: '사용자 홈 경로의 괄호(조건희(GeonheeJo))가 cmd 셸 파싱을 깨뜨림',
      fix: '스크립트에서 node 로 cli.js 엔트리포인트를 직접 실행 (shell:false)',
    },
  ],
  pipeline: {
    baseline: [
      'a_copy: scene.gltf → .glb 단일화',
      'b_resize: 텍스처 2048 상한',
      'c_texture_ktx2: uastc --level 2 --zstd 18 (KHR_texture_basisu)',
      'd_meshopt: meshopt --level high (EXT_meshopt_compression)',
      'e_lod1_simplify: simplify --ratio 0.1 --error 0.01',
    ],
    recommended: [
      'copy → resize 2048 → etc1s --quality 128 → meshopt --level high  (근거리)',
      'copy → simplify --ratio 0.1 --error 0.01 → resize 256 → etc1s --quality 100 → meshopt  (LOD1)',
    ],
  },
  keyFindings: [
    'LOD1 은 simplify 만으로는 목표에 근접조차 못 한다. simplify 는 지오메트리만 줄이는데 이 코퍼스의 GLB 는 텍스처가 용량의 대부분이라, 근거리 대비 LOD1 감소폭이 0.2% 수준에 그쳤다. LOD1 에는 별도의 텍스처 축소(256px 급)가 반드시 필요하다.',
    'UASTC L2 는 근거리 ≤4MB 목표를 만족시키지 못한다. 2048x2048 UASTC 텍스처 1장이 3.5~4MB 라, 텍스처 3장짜리 평범한 에셋도 10MB를 넘는다. 동일 해상도에서 ETC1S 로 바꾸면 약 7배 작아진다.',
    'resize 단계는 원본 텍스처가 2048 이하인 에셋에서 오히려 용량을 키운다(재인코딩 오버헤드). 원본이 4096 이상인 대형 에셋에서만 큰 이득이 난다.',
  ],
  pilotAssets: results.map((r) => ({
    folder: r.folder,
    class: r.class,
    role: r.role,
    selectionReason: r.reason,
    sourceBytes: r.sourceBytes,
    sourceMiB: +(r.sourceBytes / MiB).toFixed(2),
    finalBytes: r.finalBytes,
    finalMiB: r.finalBytes !== null ? +(r.finalBytes / MiB).toFixed(3) : null,
    lod1Bytes: r.lod1Bytes,
    lod1KiB: r.lod1Bytes !== null ? +(r.lod1Bytes / 1024).toFixed(1) : null,
    reductionPercent: r.reductionRatio !== null ? +(r.reductionRatio * 100).toFixed(2) : null,
    meetsNearTarget: r.meetsNearTarget,
    meetsLod1Target: r.meetsLod1Target,
    totalSeconds: r.totalSeconds,
    steps: r.steps,
    errors: r.errors,
    inspectFinal: r.inspect_final || null,
    inspectLod1: r.inspect_lod1 || null,
  })),
  variantExperiments: variants,
  perAssetTargetRisk: perAssetTargetRisk(),
  fullCorpusEstimate: {
    method:
      '원본 크기 구간별로 로그-크기 최근접 실측 샘플의 감축률·처리속도를 대입해 506건 합산. 구간에 직접 샘플이 없으면 가장 가까운 샘플로 대체하므로 오차가 커진다(sampleLogDistance 참고).',
    assetCount: assets.length,
    sourceGiB: +(srcTotal / GiB).toFixed(2),
    scenarios: [estimate(baselineSamples, 'baseline_2048_uastc2'), estimate(recommendedSamples, 'recommended_2048_etc1s')],
    parallelNote: '4-way 병렬은 CPU 코어 여유를 가정한 단순 나눗셈. gltf-transform 의 텍스처 인코딩이 이미 멀티코어를 쓰므로 실제 이득은 이보다 작다.',
  },
};

writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
console.log('작성: ' + OUT);
for (const s of report.fullCorpusEstimate.scenarios) {
  if (!s.available) {
    console.log(`${s.scenario}: ${s.note}`);
    continue;
  }
  console.log(
    `${s.scenario}: 근거리 ${s.estimatedNearFieldGiB}GiB + LOD1 ${s.estimatedLod1GiB}GiB = ${s.estimatedCombinedGiB}GiB ` +
      `(${s.estimatedReductionPercent}% 감축, 목표2GB ${s.meetsTotalTarget ? '충족' : '미달'}), 빌드 ${s.estimatedBuildHours}h`
  );
}
