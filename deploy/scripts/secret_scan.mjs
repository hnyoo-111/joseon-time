#!/usr/bin/env node
/**
 * 게시 전 시크릿 스캔 — 운영 아키텍처 §6 "운영 최소선".
 *   node secret_scan.mjs /srv/joseon-time/releases/r20260811
 * 하나라도 걸리면 exit 1 → publish.sh 가 게시를 중단한다.
 *
 * 판정 기준이 두 가지로 나뉘는 이유:
 *  - Sketchfab 토큰은 계정 전권 비밀키다. 릴리스에 있으면 즉시 유출이다.       → 차단
 *  - Cesium ion 토큰은 브라우저에 전달되는 것이 전제이며 도메인 제한이 방어선이다. → 허용
 *    (config.js 안에서만. 다른 파일에 박혀 있으면 하드코딩 회귀이므로 차단)
 */
import fs from 'node:fs';
import path from 'node:path';

const rel = process.argv[2];
if (!rel || !fs.existsSync(rel)) { console.error('사용법: secret_scan.mjs <릴리스 디렉터리>'); process.exit(2); }

const ROOT = process.env.APP_ROOT || '/srv/joseon-time';
const findings = [];

// .env 의 실제 토큰 값을 그대로 찾는다 — 가장 확실한 검사
const envSecrets = [];
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
    if (m && m[2].trim().length >= 16) envSecrets.push({ name: m[1], value: m[2].trim().replace(/^['"]|['"]$/g, '') });
  }
}

const PATTERNS = [
  { id: 'sketchfab-token-header', re: /Authorization["'\s:]+Token\s+[0-9a-f]{32}/i },
  { id: 'aws-key', re: /AKIA[0-9A-Z]{16}/ },
  { id: 'private-key', re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];
const ION_JWT = /eyJhbGciOi[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;
const TEXT_EXT = new Set(['.html', '.js', '.mjs', '.json', '.css', '.txt', '.geojson', '.py', '.sh', '.md']);

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!TEXT_EXT.has(path.extname(e.name))) continue;
    if (fs.statSync(p).size > 8 * 1024 * 1024) continue;

    const body = fs.readFileSync(p, 'utf8');
    const label = path.relative(rel, p);

    for (const s of envSecrets) {
      if (body.includes(s.value)) findings.push({ file: label, rule: `env:${s.name}`, severity: 'block' });
    }
    for (const pat of PATTERNS) {
      if (pat.re.test(body)) findings.push({ file: label, rule: pat.id, severity: 'block' });
    }
    if (ION_JWT.test(body) && label !== 'config.js') {
      findings.push({ file: label, rule: 'ion-token-outside-config', severity: 'block' });
    }
    if (/\.env\b/.test(label)) findings.push({ file: label, rule: 'env-file-in-release', severity: 'block' });
  }
}
walk(rel);

// 릴리스에 실행 가능한 스크립트가 섞여 들어갔는지 (구 heritage/scripts 노출 사고의 재발 방지)
for (const bad of ['scripts', '.env', '.git']) {
  if (fs.existsSync(path.join(rel, bad))) findings.push({ file: bad, rule: 'unexpected-path', severity: 'block' });
}

if (findings.length) {
  console.error('시크릿 스캔 실패 — 게시 중단');
  for (const f of findings) console.error(`  [${f.rule}] ${f.file}`);
  process.exit(1);
}
console.log(`시크릿 스캔 통과 — ${path.basename(rel)}`);
