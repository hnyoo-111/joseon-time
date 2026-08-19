import * as Cesium from 'cesium';

// -- 지형/타일셋 설정 --------------------------------------------------------
// TODO: 전국 LH DT 5m DEM 변환이 끝나면 그 결과물 URL로 교체.
// https://dj-geoserver.gaia3d.dev/data/daegu/terrain/ 은 데이터는 있으나 CORS 미허용으로
// 브라우저에서 직접 호출 불가 (서버 쪽에 Access-Control-Allow-Origin 헤더 추가 필요).
export const TERRAIN_URL = '';
export const TILESET_URL = ''; // 나스에 배포한 건물 3D Tiles tileset.json
export const CESIUM_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? '';
export const CESIUM_ION_ASSET_ID = 5122685;

// -- NAS/로컬 3D 소품 배치 ----------------------------------------------------
export const MODEL_BASE_LOCAL = '/assets/'; // public/assets/gyeongbok/...
export const MODEL_BASE_NAS = 'https://heritage-assets.gaia3d.dev/asset/';
export const DEFAULT_MODEL_FILE = 'scene.gltf';

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

export interface ModelItem {
  folder: string;
  file?: string;
  realSize: number;
  offset?: [number, number];
  position?: { lon: number; lat: number; height?: number };
  source: 'nas' | 'local';
}
export interface SiteModelConfig {
  basePosition?: { lon: number; lat: number; height?: number };
  items: ModelItem[];
}

export const MODELS: Record<string, SiteModelConfig> = {
  gyeongbok: {
    basePosition: { lon: 126.9766629, lat: 37.5791072 },
    items: [
      { folder: 'Gyeongbokgung_Cheonchujeon_Book', realSize: 0.3, offset: [0, 0], source: 'nas' },
      { folder: 'Gyeongbokgung_Cheonchujeon_BookshelfA', realSize: 1.7, offset: [1.5, 0], source: 'nas' },
      { folder: 'Gyeongbokgung_Cheonchujeon_CabinetB', realSize: 1.2, offset: [3, 0], source: 'nas' },
      { folder: 'Gyeongbokgung_Cheonchujeon_FoldingScreenA', realSize: 2.0, offset: [4.5, 0], source: 'nas' },
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

  Cesium.Model.fromGltfAsync({ url, modelMatrix, minimumPixelSize: 24 })
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
  Cesium.Cesium3DTileset.fromIonAssetId(CESIUM_ION_ASSET_ID)
    .then((t) => {
      viewer.scene.primitives.add(t);
      extraLayers.push(t);
      console.log('[Cesium ion 타일셋 로드됨]', CESIUM_ION_ASSET_ID);
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

// -- 배경지도(베이스맵) 선택지 -------------------------------------------------
export interface BasemapOption {
  id: string;
  label: string;
  create: () => Cesium.ImageryProvider;
  style?: { saturation?: number; brightness?: number; contrast?: number; gamma?: number };
}

export const BASEMAPS: BasemapOption[] = [
  {
    id: 'osm', label: '일반지도',
    create: () => new Cesium.UrlTemplateImageryProvider({
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      credit: 'OpenStreetMap contributors',
      maximumLevel: 19,
    }),
    style: { saturation: 0.18, brightness: 1.28, contrast: 0.88, gamma: 0.92 },
  },
  {
    id: 'satellite', label: '위성지도',
    create: () => new Cesium.UrlTemplateImageryProvider({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      credit: 'Esri, Maxar, Earthstar Geographics',
      maximumLevel: 19,
    }),
  },
];

/** 배경지도(0번 레이어)만 교체합니다 — 대동여지도 등 다른 오버레이 레이어는 그대로 둡니다. */
export function applyBasemap(viewer: Cesium.Viewer, id: string): Cesium.ImageryLayer {
  const opt = BASEMAPS.find((b) => b.id === id) ?? BASEMAPS[0];
  const layers = viewer.imageryLayers;
  if (layers.length > 0) layers.remove(layers.get(0), true);
  const layer = new Cesium.ImageryLayer(opt.create());
  layers.add(layer, 0);
  layer.saturation = opt.style?.saturation ?? 1;
  layer.brightness = opt.style?.brightness ?? 1;
  layer.contrast = opt.style?.contrast ?? 1;
  layer.gamma = opt.style?.gamma ?? 1;
  return layer;
}

export async function setupCesiumViewer(container: HTMLDivElement): Promise<{ viewer: Cesium.Viewer; extraLayers: unknown[] }> {
  const viewer = new Cesium.Viewer(container, {
    baseLayer: false,
    baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
    navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false,
    infoBox: false, selectionIndicator: false, creditContainer: document.createElement('div'),
  });
  applyBasemap(viewer, BASEMAPS[0].id);
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#F0EEE7');
  if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#F0EEE7');
  viewer.scene.globe.showGroundAtmosphere = false;

  const extraLayers: unknown[] = [];

  if (CESIUM_ION_TOKEN) Cesium.Ion.defaultAccessToken = CESIUM_ION_TOKEN;

  if (TERRAIN_URL) {
    try {
      viewer.terrainProvider = await Cesium.CesiumTerrainProvider.fromUrl(TERRAIN_URL, { requestVertexNormals: true });
      viewer.scene.globe.depthTestAgainstTerrain = true;
    } catch (err) { console.warn('지형 로딩 실패: ', err); }
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
