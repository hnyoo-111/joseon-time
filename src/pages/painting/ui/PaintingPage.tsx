import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { paintingByWorkId, type PaintingHotspot } from '@/entities/painting';
import { useAppStore } from '@/app/model/appStore';
import { PaintingArtwork } from '@/shared/ui/PaintingArtwork';

export function PaintingPage() {
  const { workId } = useParams();
  const navigate = useNavigate();
  const { openSite, logVisit } = useAppStore();
  const painting = workId ? paintingByWorkId(workId) : undefined;
  const [activeHotspot, setActiveHotspot] = useState<PaintingHotspot | null>(null);

  useEffect(() => {
    if (painting) logVisit('painting', painting.workId, painting.title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [painting?.workId]);

  if (!painting) {
    return (
      <div className="painting-viewer">
        <button className="pv-close" onClick={() => navigate(-1)}>✕ 닫기</button>
        <div className="pv-caption">그림을 찾을 수 없습니다.</div>
      </div>
    );
  }

  return (
    <div className="painting-viewer">
      <button className="pv-close" onClick={() => navigate(-1)}>✕ 닫기</button>
      <div className="pv-frame">
        <PaintingArtwork imageSrc={painting.imageSrc} title={painting.title} />
        {painting.hotspots.map((h) => (
          <button
            key={h.id}
            className="pv-hotspot"
            style={{ left: `${h.x}%`, top: `${h.y}%` }}
            onClick={() => setActiveHotspot(h)}
          >
            <span className="pv-hotspot-dot" />
            <span className="pv-hotspot-label">{h.label}</span>
          </button>
        ))}
        {activeHotspot && (
          <div className="pv-callout">
            <div className="pvc-q">그림 속 이 장소는 현재 어디일까요?</div>
            <div className="pvc-a">{activeHotspot.label}</div>
            <div className="pvc-desc">{activeHotspot.desc}</div>
            <button
              className="pvc-btn"
              onClick={() => { navigate('/map'); openSite(activeHotspot.heritageId); }}
            >
              지도에서 보기
            </button>
          </div>
        )}
      </div>
      <div className={'pv-caption' + (activeHotspot ? ' pv-caption-hidden' : '')}>
        <b>{painting.title}</b><br />
        <span className="pv-mock">{painting.caption}</span>
      </div>
    </div>
  );
}
