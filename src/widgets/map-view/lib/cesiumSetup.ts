import * as Cesium from 'cesium';

// -- 지형/타일셋 설정 --------------------------------------------------------
export const TERRAIN_URL = ''; // 나스 Web Station에 배포한 layer.json 폴더 (예: 5m급 DEM)
export const TILESET_URL = ''; // 나스에 배포한 건물 3D Tiles tileset.json
export const CESIUM_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? '';
export const CESIUM_ION_ASSET_ID = 5122685;

// -- 서버/로컬 3D 소품 배치 ---------------------------------------------------
export const MODEL_BASE_LOCAL = '/assets/'; // public/assets/gyeongbok/...
// 운영 자산은 189 서버(joseon-time.gaia3d.dev)가 서빙한다.
// NAS 직접 호출(heritage-assets.gaia3d.dev)은 운영 아키텍처 A15로 폐지된 경로다.
//   raw   — 스케줄러가 원천에서 직접 받은 원본:   /raw-asset/{folder}/scene.gltf
//   release— build_release.mjs 최적화 산출물:     /asset/{folder}/scene.glb
export const MODEL_BASE_SERVER = import.meta.env.VITE_ASSET_BASE ?? 'https://joseon-time.gaia3d.dev/raw-asset/';
// 릴리스(최적화) 경로는 scene.glb, 스케줄러가 받은 원본(raw) 경로는 scene.gltf.
// 어느 쪽을 볼지는 VITE_ASSET_BASE·VITE_ASSET_FILE 두 값으로만 갈린다.
export const DEFAULT_MODEL_FILE = import.meta.env.VITE_ASSET_FILE ?? 'scene.gltf';

// -- 대동여지도 오버레이 -------------------------------------------------------
// 원본: 김정호, 1861년 / 규장각한국학연구원 소장 / Public Domain
// (출처: https://commons.wikimedia.org/wiki/File:Daedongyeojido-full.jpg)
// 대동여지도는 현대 위경도 좌표계로 정밀 제작된 지도가 아니므로, 아래 범위는
// 한반도 전체를 대략 감싸는 근사 사각형입니다 — 실제 지형과 정확히 일치하지 않습니다.
export const HISTORICAL_MAP_URL = '/daedongyeojido.jpg';
export const HISTORICAL_MAP_RECTANGLE = Cesium.Rectangle.fromDegrees(124.0, 33.0, 131.3, 43.0);

export async function addHistoricalMapLayer(viewer: Cesium.Viewer): Promise<Cesium.ImageryLayer> {
  const provider = await Cesium.SingleTileImageryProvider.fromUrl(HISTORICAL_MAP_URL, {
    rectangle: HISTORICAL_MAP_RECTANGLE,
  });
  const layer = new Cesium.ImageryLayer(provider);
  layer.alpha = 0.88;
  layer.show = false;
  viewer.imageryLayers.add(layer);
  return layer;
}

// -- 1919년 조선지형도 오버레이 (행차 회랑) --------------------------------------
// 원본: 국사편찬위원회 한국근대지리정보(hgis.history.go.kr)의 1:50,000 조선지형도 WMTS.
// EPSG:5179 그리드만 제공해 Cesium 이 직접 못 읽으므로, 행차 회랑(서울~융릉)만
// 웹메르카토르 타일로 재투영해 자체 서빙한다(data/scripts/bake_map1919_tiles.py).
// 측량 기반 지도라 대동여지도와 달리 현대 좌표와 정합된다.
export const MAP1919_URL = '/tiles/map1919/{z}/{x}/{y}.png';
export const MAP1919_RECTANGLE = Cesium.Rectangle.fromDegrees(126.86, 37.17, 127.06, 37.64);

export function addMap1919Layer(viewer: Cesium.Viewer): Cesium.ImageryLayer {
  const provider = new Cesium.UrlTemplateImageryProvider({
    url: MAP1919_URL,
    rectangle: MAP1919_RECTANGLE,
    minimumLevel: 9,
    maximumLevel: 14,
    credit: new Cesium.Credit('1919 조선지형도 — 국사편찬위원회 한국근대지리정보'),
  });
  const layer = new Cesium.ImageryLayer(provider, { rectangle: MAP1919_RECTANGLE });
  layer.alpha = 0.85;
  layer.show = false;
  viewer.imageryLayers.add(layer);
  return layer;
}

export interface ModelItem {
  folder: string;
  file?: string;
  realSize: number;
  offset?: [number, number];
  position?: { lon: number; lat: number; height?: number };
  source: 'server' | 'local';
}
export interface SiteModelConfig {
  basePosition?: { lon: number; lat: number; height?: number };
  items: ModelItem[];
}

export const MODELS: Record<string, SiteModelConfig> = {
  gyeongbok: {
    basePosition: { lon: 126.9766629, lat: 37.5791072 },
    items: [
      // 아래 5건은 서버 수집분이 지도에 뜨는지 확인하려고 임시로 올렸던 표본이다.
      // 경복궁과 무관한 유물이라 검증을 마치고 내렸다 — 배치는 P1~P5(placements.json)에서 확정한다.
      // { folder: 'Chokdae', realSize: 0.5, offset: [0, 0], source: 'server' },
      // { folder: 'Haegeum', realSize: 0.7, offset: [1.5, 0], source: 'server' },
      // { folder: 'Cauldron', realSize: 0.8, offset: [3, 0], source: 'server' },
      // { folder: 'Broom', realSize: 1.0, offset: [4.5, 0], source: 'server' },
      // { folder: 'Wagon', realSize: 2.0, offset: [6, 0], source: 'server' },
      //
      // 원래 배치 대상이던 Gyeongbokgung_Cheonchujeon_* 4건. 아직 raw/ 에 수집되지 않아
      // 404 이므로 주석 상태다. sync 완료 후 되살릴 것.
      // { folder: 'Gyeongbokgung_Cheonchujeon_Book', realSize: 0.3, offset: [0, 0], source: 'server' },
      // { folder: 'Gyeongbokgung_Cheonchujeon_BookshelfA', realSize: 1.7, offset: [1.5, 0], source: 'server' },
      // { folder: 'Gyeongbokgung_Cheonchujeon_CabinetB', realSize: 1.2, offset: [3, 0], source: 'server' },
      // { folder: 'Gyeongbokgung_Cheonchujeon_FoldingScreenA', realSize: 2.0, offset: [4.5, 0], source: 'server' },
      // 근정전 원본(gyeongbok.glb, 2.45GB)은 브라우저에서 단일 GLB로 직접 로드하기엔 너무 커서 비활성화했습니다.
      // Cesium ion 3D Tiles 변환본(CESIUM_ION_ASSET_ID)으로 대체됩니다.
    ],
  },
  changdeok: { items: [] },
  changgyeong: { items: [] },
  hwaseong: { items: [] },
  namhan: { items: [] },
  jongmyo: { items: [] },
  uldolmok: { items: [] },
};

export function placeCalibratedModel(viewer: Cesium.Viewer, basePosition: { lon: number; lat: number; height?: number }, item: ModelItem, url: string, extraLayers: unknown[]) {
  const origin = item.position
    ? Cesium.Cartesian3.fromDegrees(item.position.lon, item.position.lat, item.position.height || 0)
    : Cesium.Cartesian3.fromDegrees(basePosition.lon, basePosition.lat, basePosition.height || 0);
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(origin);
  const offset = item.position ? [0, 0] : item.offset || [0, 0];
  const localT = Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(offset[0], offset[1], 0));
  const modelMatrix = Cesium.Matrix4.multiply(enu, localT, new Cesium.Matrix4());

  // 지형에 붙인다 — World Terrain 을 쓰면 높이 0 은 타원체 기준이라 모델이 뜨거나 묻힌다.
  // heightReference 를 주면 Cesium 이 modelMatrix 의 이동 성분만 지형 높이로 갈아끼우고
  // 회전(ENU)·격자 오프셋은 그대로 유지한다. scene 을 함께 넘겨야 동작한다.
  Cesium.Model.fromGltfAsync({
    url,
    modelMatrix,
    minimumPixelSize: 24,
    scene: viewer.scene,
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
  })
    .then((model) => {
      viewer.scene.primitives.add(model);
      extraLayers.push(model);
      model.readyEvent.addEventListener(() => {
        const diameter = model.boundingSphere.radius * 2;
        if (diameter > 0) model.scale = item.realSize / diameter;
      });
      model.errorEvent.addEventListener((err) => console.error('[모델 내부 에러]', url, err));
    })
    .catch((err) => console.error('[모델 로딩 실패]', url, err));
}

export function loadIonTileset(viewer: Cesium.Viewer, extraLayers: unknown[], attempt = 1) {
  const RETRY_LIMIT = 20;
  const RETRY_DELAY_MS = 30000;
  Cesium.IonResource.fromAssetId(CESIUM_ION_ASSET_ID, { accessToken: CESIUM_ION_TOKEN })
    .then((resource) => Cesium.Cesium3DTileset.fromUrl(resource))
    .then((t) => {
      viewer.scene.primitives.add(t);
      extraLayers.push(t);
    })
    .catch((err) => {
      let msg = (err && err.message) || '';
      if (!msg && err && typeof err.response === 'string') {
        try { msg = JSON.parse(err.response).message || ''; } catch { msg = err.response; }
      }
      if (msg.indexOf('still being processed') !== -1 && attempt <= RETRY_LIMIT) {
        console.warn(`[Cesium ion] 타일링 중 — ${RETRY_DELAY_MS / 1000}초 후 재시도 (${attempt}/${RETRY_LIMIT})`);
        setTimeout(() => loadIonTileset(viewer, extraLayers, attempt + 1), RETRY_DELAY_MS);
      } else {
        console.warn('Cesium ion 타일셋 로딩 실패: ', err);
      }
    });
}

export interface ViewerOptions {
  /** 행차 시뮬레이션처럼 시간축이 필요한 화면에서만 Cesium 타임바·재생 컨트롤을 켠다. */
  timeline?: boolean;
}

export async function setupCesiumViewer(
  container: HTMLDivElement,
  options: ViewerOptions = {},
): Promise<{ viewer: Cesium.Viewer; extraLayers: unknown[] }> {
  const imageryProvider = new Cesium.UrlTemplateImageryProvider({
    // 189 서버가 타일을 서빙하게 되면 VITE_TILE_URL 로 그 경로를 가리키면 된다.
    url: import.meta.env.VITE_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    credit: 'OpenStreetMap contributors',
    maximumLevel: 19,
  });
  const baseLayer = new Cesium.ImageryLayer(imageryProvider);
  const viewer = new Cesium.Viewer(container, {
    baseLayer,
    baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
    navigationHelpButton: false, fullscreenButton: false,
    animation: options.timeline ?? false, timeline: options.timeline ?? false,
    infoBox: false, selectionIndicator: false, creditContainer: document.createElement('div'),
  });
  baseLayer.saturation = 0.18; baseLayer.brightness = 1.28; baseLayer.contrast = 0.88; baseLayer.gamma = 0.92;
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#F0EEE7');
  if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#F0EEE7');
  viewer.scene.globe.showGroundAtmosphere = false;

  const extraLayers: unknown[] = [];

  // 계정 ion 토큰은 근정전 3D 타일셋(개인 자산) 로드에만 사용한다.
  // defaultAccessToken을 여기서 덮어쓰면 World Terrain 요청까지 도메인 제한에 걸리므로 건드리지 않는다.
  if (TERRAIN_URL) {
    try { viewer.terrainProvider = await Cesium.CesiumTerrainProvider.fromUrl(TERRAIN_URL); }
    catch (err) { console.warn('지형 로딩 실패: ', err); }
  } else {
    // 계정 ion 토큰 없이 CesiumJS 기본(내장) 토큰으로 World Terrain을 로드한다.
    // 실패 시 지형이 미확정 상태로 남아 배경 타일까지 멈추므로 타원체로 명시 폴백한다.
    const worldTerrain = Cesium.Terrain.fromWorldTerrain();
    worldTerrain.errorEvent.addEventListener((err) => {
      console.warn('World Terrain 로딩 실패 — 기본 타원체로 대체: ', err);
      viewer.scene.terrainProvider = new Cesium.EllipsoidTerrainProvider();
    });
    viewer.scene.setTerrain(worldTerrain);
  }

  if (TILESET_URL) {
    try {
      const bt = await Cesium.Cesium3DTileset.fromUrl(TILESET_URL);
      viewer.scene.primitives.add(bt);
      extraLayers.push(bt);
    } catch (err) { console.warn('건물 타일셋 로딩 실패: ', err); }
  }
  if (CESIUM_ION_TOKEN) loadIonTileset(viewer, extraLayers);

  return { viewer, extraLayers };
}
