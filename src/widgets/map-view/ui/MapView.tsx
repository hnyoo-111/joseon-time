import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { HERITAGES, heritageById, type Heritage } from '@/entities/heritage';
import { kingById } from '@/entities/king';
import { markerCanvas } from '../lib/markerCanvas';
import { setupCesiumViewer, placeCalibratedModel, MODELS, MODEL_BASE_LOCAL, MODEL_BASE_NAS, DEFAULT_MODEL_FILE } from '../lib/cesiumSetup';

export interface MapViewHandle {
  flyToAll: () => void;
  flyToHeritage: (h: Heritage) => void;
  flyTo: (lon: number, lat: number, height: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  toggleLayers: () => void;
  toggle2D3D: () => boolean;
}

interface MapViewProps {
  focusedHeritageId?: string | null;
  dimKingFilter?: string | null;
  showPopup?: boolean;
  onMarkerClick?: (heritageId: string) => void;
  onReady?: () => void;
}

export const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  { focusedHeritageId = null, dimKingFilter = null, showPopup = true, onMarkerClick, onReady },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const entitiesRef = useRef<Record<string, Cesium.Entity>>({});
  const extraLayersRef = useRef<unknown[]>([]);
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
      const { viewer, extraLayers } = await setupCesiumViewer(containerRef.current);
      if (cancelled) { viewer.destroy(); return; }
      viewerRef.current = viewer;
      extraLayersRef.current = extraLayers;

      HERITAGES.forEach((h) => {
        const entity = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(h.lon, h.lat, h.height + 6),
          billboard: {
            image: markerCanvas(h.type, false),
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        entitiesRef.current[h.id] = entity;

        const siteConfig = MODELS[h.id] || { items: [] };
        const basePosition = siteConfig.basePosition || { lon: h.lon, lat: h.lat, height: h.height };
        (siteConfig.items || []).forEach((m) => {
          const fileName = m.file || DEFAULT_MODEL_FILE;
          const url = m.source === 'nas'
            ? `${MODEL_BASE_NAS}${m.folder}/${fileName}`
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
        const pos = entity?.position?.getValue(viewer.clock.currentTime);
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
