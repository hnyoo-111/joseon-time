import { useState, type RefObject } from 'react';
import { BASEMAPS, type MapViewHandle } from '@/widgets/map-view';
import { CompassIcon, FitIcon, LayersIcon } from '@/shared/ui/icons';

interface MapControlsProps {
  mapRef: RefObject<MapViewHandle | null>;
  onFocusRequested: () => void;
  onFitRequested: () => void;
  historicalMapOn: boolean;
  onToggleHistoricalMap: (on: boolean) => void;
}

const BASEMAP_SHORT_LABEL: Record<string, string> = { osm: '지도', satellite: '위성' };

export function MapControls({ mapRef, onFocusRequested, onFitRequested, historicalMapOn, onToggleHistoricalMap }: MapControlsProps) {
  const [mode2D, setMode2D] = useState(false);
  const [basemapId, setBasemapId] = useState(BASEMAPS[0].id);

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
      </div>
      <div className="mc-divider" />
      <div className="mc-group">
        <button
          className="btn-mode"
          data-tip={`배경지도: ${BASEMAPS.find((b) => b.id === basemapId)?.label} (전환)`}
          onClick={() => {
            const ids = BASEMAPS.map((b) => b.id);
            const next = ids[(ids.indexOf(basemapId) + 1) % ids.length];
            mapRef.current?.setBasemap(next);
            setBasemapId(next);
          }}
        >
          {BASEMAP_SHORT_LABEL[basemapId] ?? basemapId}
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
