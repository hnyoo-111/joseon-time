import { forwardRef, useEffect, useImperativeHandle, useState, type RefObject } from 'react';
import { fetchPublishedAssets, type Asset } from '@/entities/asset';
import { ModelPreviewModal } from '@/shared/ui/ModelPreviewModal';
import type { MapViewHandle } from '@/widgets/map-view';

export interface AssetLayerPanelHandle {
  openPreview: (assetId: string) => void;
}

export const AssetLayerPanel = forwardRef<AssetLayerPanelHandle, { mapRef: RefObject<MapViewHandle | null> }>(
  function AssetLayerPanel({ mapRef }, ref) {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);

  useImperativeHandle(ref, () => ({
    openPreview(assetId: string) {
      const a = assets.find((x) => x.id === assetId);
      if (a?.modelUrl) setPreviewAsset(a);
    },
  }), [assets]);

  // 패널을 열 때마다 다시 불러옵니다 — 관리자 쪽에서 좌표·공개 상태를 바꾼 게
  // 바로 반영되도록(예전엔 최초 1회만 불러오고 캐시해서 최신 상태가 안 보였습니다).
  useEffect(() => {
    if (!open) return;
    setRefreshing(true);
    fetchPublishedAssets().then((list) => { setAssets(list); setRefreshing(false); });
  }, [open]);

  useEffect(() => {
    const markers = assets
      .filter((a) => visibleIds.has(a.id) && a.lon !== null && a.lat !== null)
      .map((a) => ({ id: a.id, lon: a.lon as number, lat: a.lat as number, title: a.title }));
    mapRef.current?.syncAssetMarkers(markers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIds, assets]);

  function toggle(a: Asset) {
    const turningOn = !visibleIds.has(a.id);
    setVisibleIds((prev) => {
      const next = new Set(prev);
      if (next.has(a.id)) next.delete(a.id); else next.add(a.id);
      return next;
    });
    if (turningOn && a.lon !== null && a.lat !== null) {
      mapRef.current?.flyTo(a.lon, a.lat, 0, 0);
      setOpen(false);
    }
  }

  return (
    <>
      <button className="journey-log-btn asset-layer-btn" onClick={() => setOpen(true)}>
        레이어 관리
        {visibleIds.size > 0 && <span className="jlb-count">{visibleIds.size}</span>}
      </button>

      {open && (
        <div className="journey-log-modal" onClick={() => setOpen(false)}>
          <div className="jl-card" onClick={(e) => e.stopPropagation()}>
            <div className="jl-head">
              <div>
                <div className="jl-head-title">3D 에셋 레이어</div>
                <div className="jl-head-sub">지자체에서 등록·공개한 자산을 지도 위에 켜고 끌 수 있습니다</div>
              </div>
              <button className="jl-close" onClick={() => setOpen(false)}>✕</button>
            </div>
            <div className="jl-body">
              {refreshing ? (
                <div className="jl-empty">불러오는 중…</div>
              ) : assets.length === 0 ? (
                <div className="jl-empty">아직 공개된 3D 자산이 없습니다.</div>
              ) : (
                assets.map((a) => (
                  <div className="asset-layer-row" key={a.id}>
                    <button
                      className={'admin-switch' + (visibleIds.has(a.id) ? ' on' : '')}
                      onClick={() => toggle(a)}
                      aria-label="레이어 표시 전환"
                    >
                      <span className="admin-switch-knob" />
                    </button>
                    <div className="asset-layer-info">
                      <div className="asset-layer-title">{a.title}</div>
                      <div className="asset-layer-sub">{a.category || '자산'}{a.lon === null && ' · 위치 미지정'}</div>
                    </div>
                    {a.modelUrl && (
                      <button className="admin-link admin-link-btn" onClick={() => setPreviewAsset(a)}>미리보기</button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {previewAsset && previewAsset.modelUrl && (
        <ModelPreviewModal title={previewAsset.title} src={previewAsset.modelUrl} onClose={() => setPreviewAsset(null)} />
      )}
    </>
  );
});
