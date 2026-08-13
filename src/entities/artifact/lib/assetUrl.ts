import { MODEL_BASE_SERVER, DEFAULT_MODEL_FILE } from '@/widgets/map-view/lib/cesiumSetup';

/** 자산을 실제로 서빙하는 189 서버. VITE_ASSET_BASE 가 상대경로일 때의 보정 대상이다. */
const ASSET_ORIGIN = 'https://joseon-time.gaia3d.dev';

/**
 * 유물 모델의 절대 URL 을 만든다.
 *
 * VITE_ASSET_BASE 는 배포 환경에서 `/raw-asset/` 같은 상대경로로 주입될 수 있는데,
 * 그 경로는 nginx 뒤에서만 유효하다. dev 서버(localhost:5173)에는 존재하지 않으므로
 * 상대경로인 경우에만 운영 오리진을 앞에 붙여 절대 URL 로 승격시킨다.
 */
export function artifactModelUrl(folder: string, file: string = DEFAULT_MODEL_FILE): string {
  const base = MODEL_BASE_SERVER.endsWith('/') ? MODEL_BASE_SERVER : `${MODEL_BASE_SERVER}/`;
  const absoluteBase = /^https?:\/\//i.test(base) ? base : `${ASSET_ORIGIN}${base.startsWith('/') ? '' : '/'}${base}`;
  return `${absoluteBase}${encodeURIComponent(folder)}/${file}`;
}
