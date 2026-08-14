import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/app/model/appStore';
import { heritageById, TYPE_LABEL, type HeritageType } from '@/entities/heritage';
import { MapView, type MapViewHandle } from '@/widgets/map-view';
import { TimelineSidebar } from '@/widgets/timeline-sidebar';
import { DetailPanel } from '@/widgets/detail-panel';
import { MapControls } from '@/widgets/map-controls';
import { JourneyLog } from '@/widgets/journey-log';
import { TypeIcon } from '@/shared/ui/icons';

const LEGEND_TYPES: HeritageType[] = ['palace', 'fortress', 'shrine', 'site'];

export function MapPage() {
  const mapRef = useRef<MapViewHandle>(null);
  const { mapFocusHeritageId, currentKingFilter, openSite } = useAppStore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [historicalMapOn, setHistoricalMapOn] = useState(false);
  const [routeOn, setRouteOn] = useState(false);

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
        />

        <JourneyLog />

        <div className="map-legend">
          {LEGEND_TYPES.map((t) => (
            <div className="legend-item" key={t}>
              <span className="legend-dot"><TypeIcon type={t} size={8} /></span>
              {TYPE_LABEL[t]}
            </div>
          ))}
        </div>

        {historicalMapOn && (
          <div className="historical-map-badge">
            ⚠ 대동여지도(1861, 규장각한국학연구원 소장 · Public Domain) — 현대 좌표와 정밀하게 일치하지 않는 근사 오버레이입니다.
          </div>
        )}

        {routeOn && (
          <div className="historical-map-badge route-badge">
            ⚠ 정조 화성행차(1795, 을묘원행) — 일정은 『원행을묘정리의궤』 기록을 따르되, 지도의 선은
            1914년 도로망(<a href="https://www.hisgeo.info/wiki/근대_교통로_DB" target="_blank" rel="noreferrer">근대 교통로 DB</a>)
            위에서 계산한 <strong>근사 경로</strong>입니다. 1795년 행차로 그 자체는 아니며,
            &lsquo;근사&rsquo;로 표시된 지점은 터만 남아 위치를 추정한 곳입니다.
          </div>
        )}

        <MapControls
          mapRef={mapRef}
          historicalMapOn={historicalMapOn}
          routeOn={routeOn}
          onToggleRoute={setRouteOn}
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
