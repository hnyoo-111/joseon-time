import { useState, type RefObject } from 'react';
import type { MapViewHandle } from '@/widgets/map-view';
import { CompassIcon, FitIcon, LayersIcon } from '@/shared/ui/icons';

interface MapControlsProps {
  mapRef: RefObject<MapViewHandle | null>;
  onFocusRequested: () => void;
  onFitRequested: () => void;
  historicalMapOn: boolean;
  onToggleHistoricalMap: (on: boolean) => void;
  routeOn: boolean;
  onToggleRoute: (on: boolean) => void;
}

export function MapControls({ mapRef, onFocusRequested, onFitRequested, historicalMapOn, onToggleHistoricalMap, routeOn, onToggleRoute }: MapControlsProps) {
  const [mode2D, setMode2D] = useState(false);

  return (
    <div className="map-controls">
      <div className="mc-group">
        <button data-tip="확대" onClick={() => mapRef.current?.zoomIn()}>+</button>
        <button data-tip="축소" onClick={() => mapRef.current?.zoomOut()}>−</button>
      </div>
      <div className="mc-divider" />
      <div className="mc-group">
        <button data-tip="선택한 문화재로 이동" onClick={onFocusRequested}><CompassIcon /></button>
        <button data-tip="전체 보기" onClick={onFitRequested}><FitIcon /></button>
      </div>
      <div className="mc-divider" />
      <div className="mc-group">
        <button
          className={historicalMapOn ? 'active' : ''}
          data-tip="대동여지도 겹쳐보기 (근사 오버레이)"
          onClick={() => { const on = mapRef.current?.toggleHistoricalMap(); onToggleHistoricalMap(!!on); }}
        >
          <LayersIcon />
        </button>
        <button
          className={routeOn ? 'active' : ''}
          data-tip="정조 화성행차 경로 (1795 · 근사 경로)"
          onClick={() => { const on = mapRef.current?.toggleHaenghaengRoute(); onToggleRoute(!!on); }}
        >
          行
        </button>
      </div>
      <div className="mc-divider" />
      <div className="mc-group">
        <button
          className="btn-mode"
          data-tip="2D / 3D 전환"
          onClick={() => { const is2D = mapRef.current?.toggle2D3D(); setMode2D(!!is2D); }}
        >
          {mode2D ? '3D' : '2D'}
        </button>
      </div>
    </div>
  );
}
