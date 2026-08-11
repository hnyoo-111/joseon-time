import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { journeyById, type JourneyStep } from '@/entities/journey';
import { heritageById } from '@/entities/heritage';
import { workById } from '@/entities/work';
import { useAppStore } from '@/app/model/appStore';
import { MapView, type MapViewHandle } from '@/widgets/map-view';
import { JourneyTimelineBar } from '@/widgets/journey-timeline-bar';
import { YearSplash } from '@/shared/ui/YearSplash';

export function JourneyPage() {
  const { journeyId } = useParams();
  const journey = journeyId ? journeyById(journeyId) : undefined;
  const navigate = useNavigate();
  const { openSite, openWork, logVisit } = useAppStore();

  const mapRef = useRef<MapViewHandle>(null);
  const [showSplash, setShowSplash] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!journey) return;
    logVisit('journey', journey.id, journey.title);
    const t = setTimeout(() => setShowSplash(false), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journey?.id]);

  const step = journey?.steps[stepIndex];

  useEffect(() => {
    if (!step || showSplash) return;
    mapRef.current?.flyTo(step.lon, step.lat, step.height);
    logVisit('step', step.id, `${journey!.title} · ${step.title}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, showSplash]);

  if (!journey) {
    return (
      <div className="map-wrap" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)' }}>
        존재하지 않는 시간여행입니다. <button className="ghost-btn" style={{ width: 'auto', marginLeft: 12 }} onClick={() => navigate('/')}>메인으로</button>
      </div>
    );
  }

  function handleMarkerClick(heritageId: string) {
    const idx = journey!.steps.findIndex((s) => s.heritageId === heritageId);
    if (idx !== -1) { setStepIndex(idx); return; }
    const h = heritageById(heritageId);
    if (h) mapRef.current?.flyToHeritage(h);
  }

  function goToWorkAndExit(workId: string) {
    const w = workById(workId)!;
    navigate('/map');
    if (w.heritages[0]) openSite(w.heritages[0]);
    openWork(workId);
  }

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <>
      <YearSplash show={showSplash} year={journey.year} subtitle={journey.heroLine} />
      <div className="map-wrap">
        <MapView ref={mapRef} focusedHeritageId={step?.heritageId ?? null} showPopup={false} onMarkerClick={handleMarkerClick} />

        <div className="journey-ui">
          <div className="journey-header">
            <div className="jt-year">{journey.year}</div>
            <div className="jt-title">{journey.title}</div>
            <div className="jt-step-count">STEP {pad(stepIndex + 1)} / {pad(journey.steps.length)}</div>
          </div>

          {step && <StoryCardPanel step={step} onOpenPainting={() => navigate(`/painting/${step.workId}`)} onOpenWork={goToWorkAndExit} />}

          <JourneyTimelineBar
            steps={journey.steps}
            activeIndex={stepIndex}
            onSelect={setStepIndex}
            onPrev={() => setStepIndex((i) => Math.max(0, i - 1))}
            onNext={() => setStepIndex((i) => Math.min(journey.steps.length - 1, i + 1))}
          />
        </div>
      </div>
    </>
  );
}

function StoryCardPanel({ step, onOpenPainting, onOpenWork }: { step: JourneyStep; onOpenPainting: () => void; onOpenWork: (workId: string) => void }) {
  return (
    <div className="story-card-panel">
      <div className="sc-year">{step.year}</div>
      <div className="sc-phase">STEP · {step.phase}</div>
      <div className="sc-title">{step.title}</div>
      <div className="sc-desc">{step.desc}</div>
      {step.mock && <div className="sc-mock">⚠ {step.mockNote}</div>}
      {(step.painting || step.relatedWorks) && (
        <div className="sc-actions">
          {step.painting && <button className="sc-btn" onClick={onOpenPainting}>그림 속으로 들어가기</button>}
          {step.relatedWorks?.map((wid) => {
            const w = workById(wid)!;
            return <button key={wid} className="sc-btn ghost" onClick={() => onOpenWork(wid)}>{w.title} 보기</button>;
          })}
        </div>
      )}
    </div>
  );
}
