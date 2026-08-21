import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/app/model/appStore';
import { heritageById } from '@/entities/heritage';
import { MapView, type MapViewHandle } from '@/widgets/map-view';
import { TimelineSidebar } from '@/widgets/timeline-sidebar';
import { DetailPanel } from '@/widgets/detail-panel';
import { MapControls } from '@/widgets/map-controls';
import { JourneyLog, type JourneyLogHandle } from '@/widgets/journey-log';
import { AssetLayerPanel, type AssetLayerPanelHandle } from '@/widgets/asset-layers';

export function MapPage() {
  const mapRef = useRef<MapViewHandle>(null);
  const journeyLogRef = useRef<JourneyLogHandle>(null);
  const assetLayerRef = useRef<AssetLayerPanelHandle>(null);
  const { mapFocusHeritageId, currentKingFilter, openSite, visitedLog } = useAppStore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [historicalMapOn, setHistoricalMapOn] = useState(false);
  const [assetLayerCount, setAssetLayerCount] = useState(0);

  // single source of truth: whenever the focused heritage changes, fly the camera there.
  useEffect(() => {
    if (!mapFocusHeritageId) return;
    const h = heritageById(mapFocusHeritageId);
    if (h) mapRef.current?.flyToHeritage(h);
  }, [mapFocusHeritageId]);

  return (
    <>
      <TimelineSidebar collapsed={sidebarCollapsed} />
      <button className="panel-collapse-btn collapse-left" onClick={() => setSidebarCollapsed((v) => !v)} title="왼쪽 패널 접기/펼치기">
        {sidebarCollapsed ? '›' : '‹'}
      </button>

      <div className="map-wrap">
        <MapView
          ref={mapRef}
          focusedHeritageId={mapFocusHeritageId}
          dimKingFilter={currentKingFilter}
          onMarkerClick={(id) => openSite(id)}
          onAssetMarkerClick={(id) => assetLayerRef.current?.openPreview(id)}
        />

        <JourneyLog ref={journeyLogRef} />
        <AssetLayerPanel ref={assetLayerRef} mapRef={mapRef} onVisibleCountChange={setAssetLayerCount} />

        {historicalMapOn && (
          <div className="historical-map-badge">
            ⚠ 대동여지도(1861, 규장각한국학연구원 소장 · Public Domain) — 현대 좌표와 정밀하게 일치하지 않는 근사 오버레이입니다.
          </div>
        )}

        <MapControls
          mapRef={mapRef}
          historicalMapOn={historicalMapOn}
          onToggleHistoricalMap={setHistoricalMapOn}
          onFocusRequested={() => {
            if (mapFocusHeritageId) {
              const h = heritageById(mapFocusHeritageId);
              if (h) mapRef.current?.flyToHeritage(h);
            } else {
              mapRef.current?.flyToAll();
            }
          }}
          onFitRequested={() => mapRef.current?.flyToAll()}
          journeyLogRef={journeyLogRef}
          journeyLogCount={visitedLog.length}
          assetLayerRef={assetLayerRef}
          assetLayerCount={assetLayerCount}
        />
      </div>

      <button
        className="panel-collapse-btn collapse-right"
        onClick={() => setPanelCollapsed((v) => !v)}
        title="오른쪽 패널 접기/펼치기"
      >
        {panelCollapsed ? '‹' : '›'}
      </button>
      <DetailPanel collapsed={panelCollapsed} />
    </>
  );
}
