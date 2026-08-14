import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { HERITAGES, heritageById, type Heritage } from '@/entities/heritage';
import { kingById } from '@/entities/king';
import { markerCanvas } from '../lib/markerCanvas';
import { setupCesiumViewer, placeCalibratedModel, addHistoricalMapLayer, addMap1919Layer, MODELS, MODEL_BASE_LOCAL, MODEL_BASE_SERVER, DEFAULT_MODEL_FILE } from '../lib/cesiumSetup';
import { addHaenghaengRoute, flyToRoute, removeRoute, type HaenghaengRoute } from '../lib/haenghaengRoute';
import {
  buildProcession, describeTime, flyToProcession, removeProcession, seekToDay, trackLead, DEFAULT_UNITS,
  type Procession, type ProcessionTick,
} from '../lib/haenghaengProcession';

export interface MapViewHandle {
  flyToAll: () => void;
  flyToHeritage: (h: Heritage) => void;
  flyTo: (lon: number, lat: number, height: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  toggleLayers: () => void;
  toggle2D3D: () => boolean;
  toggleHistoricalMap: () => boolean;
  /** 1919년 조선지형도(행차 회랑) 오버레이 토글. */
  toggleMap1919: () => boolean;
  /** 화성행차 경로 레이어를 켜고 끈다. 켜질 때 경로 전체로 카메라를 맞춘다. */
  toggleHaenghaengRoute: () => boolean;
  /** 켜져 있는 경우의 경로 정보(구간·총거리·고지문). 꺼져 있으면 null. */
  haenghaengRoute: () => HaenghaengRoute | null;
  /** 행차 경로와 행렬 시뮬레이션을 한 번에 올린다(여정 화면용). */
  startHaenghaeng: () => Promise<Procession | null>;
  /** 선두 추적 카메라 on/off */
  trackProcession: (on: boolean) => void;
  /** 재생/일시정지 토글. 변경된 재생 여부를 돌려준다. */
  togglePlay: () => boolean;
  /** 재생 배속(시뮬레이션 초/실제 초) */
  /** n일차 시작(이동일이면 출발 시각)으로 시계를 옮긴다. */
  seekDay: (dayIndex: number) => void;
}

interface MapViewProps {
  /** Cesium 타임바·재생 컨트롤 표시 여부. 행차 시뮬레이션 화면에서만 켠다. */
  timeline?: boolean;
  focusedHeritageId?: string | null;
  dimKingFilter?: string | null;
  showPopup?: boolean;
  onMarkerClick?: (heritageId: string) => void;
  onReady?: () => void;
  /** 행차 시계가 흐를 때마다(초 단위로 눌러서) 현재 일자·시각을 알린다. */
  onProcessionTick?: (tick: ProcessionTick) => void;
}

export const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  { timeline = false, focusedHeritageId = null, dimKingFilter = null, showPopup = true, onMarkerClick, onReady, onProcessionTick },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const entitiesRef = useRef<Record<string, Cesium.Entity>>({});
  const extraLayersRef = useRef<unknown[]>([]);
  const historicalLayerRef = useRef<Cesium.ImageryLayer | null>(null);
  const map1919LayerRef = useRef<Cesium.ImageryLayer | null>(null);
  const routeRef = useRef<HaenghaengRoute | null>(null);
  const routeLoadingRef = useRef(false);
  const processionRef = useRef<Procession | null>(null);
  const onTickRef = useRef(onProcessionTick);
  onTickRef.current = onProcessionTick;
  const onMarkerClickRef = useRef(onMarkerClick);
  onMarkerClickRef.current = onMarkerClick;
  const popupRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const is2DRef = useRef(false);
  const layersVisibleRef = useRef(true);
  const focusedHeritageIdRef = useRef(focusedHeritageId);
  focusedHeritageIdRef.current = focusedHeritageId;

  const refreshMarkers = () => {
    Object.keys(entitiesRef.current).forEach((id) => {
      const h = heritageById(id)!;
      const entity = entitiesRef.current[id];
      const selected = focusedHeritageId === id;
      const dim = !!dimKingFilter && !h.kings.includes(dimKingFilter);
      const billboard = entity.billboard!;
      billboard.image = new Cesium.ConstantProperty(markerCanvas(h.type, selected));
      billboard.color = new Cesium.ConstantProperty(Cesium.Color.WHITE.withAlpha(dim ? 0.32 : 1));
      billboard.scale = new Cesium.ConstantProperty(selected ? 1.08 : 1);
    });
  };

  // -- one-time init --
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!containerRef.current) return;
      const { viewer, extraLayers } = await setupCesiumViewer(containerRef.current, { timeline });
      if (cancelled) { viewer.destroy(); return; }
      viewerRef.current = viewer;
      extraLayersRef.current = extraLayers;
      map1919LayerRef.current = addMap1919Layer(viewer);
      addHistoricalMapLayer(viewer).then((layer) => {
        if (cancelled) return;
        historicalLayerRef.current = layer;
      }).catch((err) => console.warn('대동여지도 레이어 로딩 실패: ', err));

      HERITAGES.forEach((h) => {
        const entity = viewer.entities.add({
          // 절대 고도(h.height)로 두면 지형 로딩 후 실제 지면보다 낮아 마커가 땅에 묻힌다.
          // 지형 기준 상대 높이로 두면 어디서든 지면 위 6m 에 뜬다.
          position: Cesium.Cartesian3.fromDegrees(h.lon, h.lat, 6),
          billboard: {
            image: markerCanvas(h.type, false),
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        entitiesRef.current[h.id] = entity;

        const siteConfig = MODELS[h.id] || { items: [] };
        const basePosition = siteConfig.basePosition || { lon: h.lon, lat: h.lat, height: h.height };
        (siteConfig.items || []).forEach((m) => {
          const fileName = m.file || DEFAULT_MODEL_FILE;
          // 카탈로그 폴더명에는 공백이 포함된 것이 있어 그대로 붙이면 URL이 깨진다.
          const url = m.source === 'server'
            ? `${MODEL_BASE_SERVER}${encodeURIComponent(m.folder)}/${fileName}`
            : `${MODEL_BASE_LOCAL}${h.id}/${m.folder ? m.folder + '/' : ''}${fileName}`;
          placeCalibratedModel(viewer, basePosition, m, url, extraLayers);
        });
      });

      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
        const picked = viewer.scene.pick(click.position);
        if (picked && picked.id) {
          const found = Object.keys(entitiesRef.current).find((id) => entitiesRef.current[id] === picked.id);
          if (found) onMarkerClickRef.current?.(found);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      viewer.scene.postRender.addEventListener(() => {
        const popup = popupRef.current;
        if (!popup) return;
        if (!showPopup || !focusedHeritageIdRef.current) { popup.style.display = 'none'; return; }
        const entity = entitiesRef.current[focusedHeritageIdRef.current];
        let pos = entity?.position?.getValue(viewer.clock.currentTime);
        if (pos) {
          // 마커가 지형 기준 상대 높이로 그려지므로 팝업도 지형 높이를 얹어 투영한다.
          const carto = Cesium.Cartographic.fromCartesian(pos);
          const ground = viewer.scene.globe.getHeight(carto);
          if (ground !== undefined) {
            pos = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, ground + carto.height);
          }
        }
        const win = pos ? Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, pos) : undefined;
        if (!win) { popup.style.display = 'none'; return; }
        popup.style.display = 'block';
        popup.style.left = `${win.x}px`;
        popup.style.top = `${win.y}px`;
      });

      setLoading(false);
      onReady?.();
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(127.0, 36.6, 650000),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-75), roll: 0 },
        duration: 0,
      });
      refreshMarkers();
    })();

    return () => {
      cancelled = true;
      if (viewerRef.current && processionRef.current) removeProcession(viewerRef.current, processionRef.current);
      processionRef.current = null;
      if (viewerRef.current && routeRef.current) removeRoute(viewerRef.current, routeRef.current);
      routeRef.current = null;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -- react to focus / filter changes --
  useEffect(() => {
    if (!viewerRef.current) return;
    refreshMarkers();
    const popup = popupRef.current;
    if (popup) {
      if (focusedHeritageId) {
        const h = heritageById(focusedHeritageId);
        if (h) {
          const kingName = h.kings[0] ? kingById(h.kings[0])?.name : undefined;
          popup.querySelector('.mp-title')!.textContent = h.name;
          popup.querySelector('.mp-sub')!.textContent = `${kingName ? kingName + ' · ' : ''}${h.year}`;
        }
      } else {
        popup.style.display = 'none';
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedHeritageId, dimKingFilter]);

  useImperativeHandle(ref, () => ({
    flyToAll() {
      viewerRef.current?.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(127.0, 36.6, 650000),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-75), roll: 0 },
        duration: 1.3,
      });
    },
    flyToHeritage(h: Heritage) {
      viewerRef.current?.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(h.lon, h.lat - 0.011, h.height + 850),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-44), roll: 0 },
        duration: 1.6,
      });
    },
    flyTo(lon: number, lat: number, height: number) {
      viewerRef.current?.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat - 0.008, height + 650),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-40), roll: 0 },
        duration: 1.5,
      });
    },
    zoomIn() {
      const v = viewerRef.current; if (!v) return;
      v.camera.zoomIn(v.camera.positionCartographic.height * 0.4);
    },
    zoomOut() {
      const v = viewerRef.current; if (!v) return;
      v.camera.zoomOut(v.camera.positionCartographic.height * 0.5);
    },
    toggleLayers() {
      layersVisibleRef.current = !layersVisibleRef.current;
      extraLayersRef.current.forEach((p) => { (p as { show: boolean }).show = layersVisibleRef.current; });
    },
    toggle2D3D() {
      const v = viewerRef.current; if (!v) return is2DRef.current;
      is2DRef.current = !is2DRef.current;
      if (is2DRef.current) v.scene.morphTo2D(1.0); else v.scene.morphTo3D(1.0);
      return is2DRef.current;
    },
    toggleHistoricalMap() {
      const layer = historicalLayerRef.current;
      if (!layer) return false;
      layer.show = !layer.show;
      return layer.show;
    },
    toggleMap1919() {
      const layer = map1919LayerRef.current;
      if (!layer) return false;
      layer.show = !layer.show;
      return layer.show;
    },
    toggleHaenghaengRoute() {
      const v = viewerRef.current;
      if (!v) return false;
      const route = routeRef.current;
      if (route) {
        route.dataSource.show = !route.dataSource.show;
        if (route.dataSource.show) flyToRoute(v, route);
        return route.dataSource.show;
      }
      // 최초 요청 시에만 GeoJSON 을 받는다. 응답 전 재클릭으로 중복 로드되지 않게 막는다.
      if (routeLoadingRef.current) return false;
      routeLoadingRef.current = true;
      addHaenghaengRoute(v)
        .then((loaded) => {
          if (!viewerRef.current) return;
          routeRef.current = loaded;
          flyToRoute(viewerRef.current, loaded);
        })
        .catch((err) => console.error('[행차 경로 로딩 실패]', err))
        .finally(() => { routeLoadingRef.current = false; });
      return true;
    },
    haenghaengRoute() {
      const route = routeRef.current;
      return route && route.dataSource.show ? route : null;
    },
    async startHaenghaeng() {
      const v = viewerRef.current;
      if (!v) return null;
      if (processionRef.current) return processionRef.current;
      try {
        const loaded = routeRef.current ?? (await addHaenghaengRoute(v));
        if (!viewerRef.current) return null;
        routeRef.current = loaded;
        // 모델 프리페치 — 240개 엔티티가 같은 GLB 를 동시에 당기면 Cesium 요청 큐(전역 50개)를
        // 독점해 지도·지형 타일이 굶는다(첫 진입 흰 화면). 고유 URI 만 먼저 받아 캐시를 데운다.
        const uris = [...new Set(DEFAULT_UNITS.map((u) => u.uri).filter((u): u is string => !!u))];
        await Promise.all(uris.map((u) => fetch(u, { cache: 'force-cache' }).catch(() => undefined)));
        if (!viewerRef.current) return null;
        const procession = buildProcession(viewerRef.current, loaded);
        processionRef.current = procession;

        // 시계는 매 프레임 돌지만 화면 표기는 분 단위면 충분하다 — 바뀔 때만 올린다.
        let lastKey = '';
        viewerRef.current.clock.onTick.addEventListener((clock) => {
          const p = processionRef.current;
          if (!p || !onTickRef.current) return;
          const tick = describeTime(p, clock.currentTime);
          const key = `${tick.dayIndex}|${tick.clock}`;
          if (key === lastKey) return;
          lastKey = key;
          onTickRef.current(tick);
        });
        // 진입 카메라: 경로 전체가 아니라 **출발 도열 중인 행렬 전체**를 잡는다.
        if (!flyToProcession(viewerRef.current, procession, 2.4)) {
          flyToRoute(viewerRef.current, loaded);
        }
        return procession;
      } catch (err) {
        console.error('[행차 시뮬레이션 시작 실패]', err);
        return null;
      }
    },
    trackProcession(on: boolean) {
      const v = viewerRef.current;
      const p = processionRef.current;
      if (v && p) trackLead(v, p, on);
    },
    togglePlay() {
      const v = viewerRef.current;
      if (!v) return false;
      v.clock.shouldAnimate = !v.clock.shouldAnimate;
      return v.clock.shouldAnimate;
    },
    seekDay(dayIndex: number) {
      const v = viewerRef.current;
      const p = processionRef.current;
      if (!v || !p) return;
      // 일차 점프 = "그 날의 장면"으로: 시계를 옮기고 카메라도 행렬 위치로 날아간다.
      // (팔로우 중이면 flyToProcession 이 개입하지 않고 팔로우 카메라가 즉시 따라잡는다.)
      seekToDay(v, p, dayIndex);
      flyToProcession(v, p, 1.6);
    },
  }), []);

  return (
    <div className="cesium-container-wrap" style={{ position: 'absolute', inset: 0 }}>
      <div ref={containerRef} className="cesium-container" />
      {loading && <div className="map-loading">지도를 불러오는 중…</div>}
      {showPopup && (
        <div ref={popupRef} className="map-popup" style={{ display: 'none' }}>
          <div className="mp-card" onClick={() => focusedHeritageId && onMarkerClickRef.current?.(focusedHeritageId)}>
            <div className="mp-title" />
            <div className="mp-sub" />
          </div>
          <div className="mp-stem" />
        </div>
      )}
    </div>
  );
});
