import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { journeyById, type JourneyStep } from '@/entities/journey';
import { heritageById } from '@/entities/heritage';
import { workById } from '@/entities/work';
import { useAppStore } from '@/app/model/appStore';
import { MapView, PROCESSION_CONFIGS, type MapViewHandle, type DayWindow, type ProcessionTick } from '@/widgets/map-view';
import { ProcessionTimebar } from '@/widgets/procession-timebar';
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
  // 행렬 시뮬레이션은 경로를 굳혀 둔 여정에만 있다(화성행차·단종 유배길).
  const hasProcession = !!journey && journey.id in PROCESSION_CONFIGS;
  const [days, setDays] = useState<DayWindow[]>([]);
  const [tick, setTick] = useState<ProcessionTick | null>(null);
  const [tracking, setTracking] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [historicalOn, setHistoricalOn] = useState(false);

  useEffect(() => {
    if (!journey) return;
    logVisit('journey', journey.id, journey.title);
    const t = setTimeout(() => setShowSplash(false), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journey?.id]);

  // 지도가 준비되면 행차 경로와 행렬을 올린다. 화면에 들어오자마자 보이는 게 이 화면의 목적이다.
  const handleMapReady = () => {
    if (!hasProcession) return;
    mapRef.current?.startHaenghaeng(journey!.id).then((p) => setDays(p?.days ?? []));
  };

  const step = journey?.steps[stepIndex];
  // 행차 페이지 첫 진입은 행렬을 잡는 카메라(startHaenghaeng)가 담당한다.
  // "스텝이 실제로 바뀐 경우"에만 스텝 카메라를 쏜다 — 최초 스텝은 건너뛰고,
  // StrictMode 의 effect 중복 실행에도 같은 스텝으로는 두 번 날지 않는다(멱등).
  const lastFlownStepId = useRef<string | null>(null);

  useEffect(() => {
    if (!step || showSplash) return;
    logVisit('step', step.id, `${journey!.title} · ${step.title}`);
    if (hasProcession && lastFlownStepId.current === null) { lastFlownStepId.current = step.id; return; }
    if (lastFlownStepId.current === step.id) return;
    lastFlownStepId.current = step.id;
    mapRef.current?.flyTo(step.lon, step.lat, step.height);
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
      <div className={`map-wrap${hasProcession ? ' has-procession' : ''}`}>
        <MapView
          ref={mapRef}

          focusedHeritageId={step?.heritageId ?? null}
          showPopup={false}
          onMarkerClick={handleMarkerClick}
          onReady={handleMapReady}
          onProcessionTick={setTick}
        />

        {hasProcession && (
          <details className="route-notice">
            <summary>⚠ 근사 재현 — 실제 당대의 길·행렬이 아닙니다</summary>
            <p>
              일정은 사료(의궤·실록) 기록을 따르되, 지도의 선은 1914년 도로망(수로는 하천 중심선)
              위에서 계산한 <strong>근사 경로</strong>입니다. &lsquo;근사&rsquo; 표시 지점은
              터만 남아 위치를 추정한 곳이며, 행렬 모델은 국가유산청 유물 스캔으로 대신한 것이라 실제 구성과 다릅니다.
            </p>
            <p className="rn-sources">
              출처 — 도로망: <a href="https://www.hisgeo.info/wiki/근대_교통로_DB" target="_blank" rel="noreferrer">근대 교통로 DB</a> (1914년 교통로)
              · 배경 지도: <a href="https://hgis.history.go.kr/mod_g1/main.do" target="_blank" rel="noreferrer">국사편찬위원회 한국근대지리정보</a> (1919년 조선지형도)
            </p>
          </details>
        )}

        {days.length > 0 && (
          <ProcessionTimebar
            days={days}
            tick={tick}
            playing={playing}
            tracking={tracking}
            historicalOn={historicalOn}
            onTogglePlay={() => setPlaying(!!mapRef.current?.togglePlay())}
            onSeekDay={(i) => mapRef.current?.seekDay(i)}
            onToggleTracking={() => { const next = !tracking; setTracking(next); mapRef.current?.trackProcession(next); }}
            onToggleHistorical={() => setHistoricalOn(!!mapRef.current?.toggleMap1919())}
          />
        )}

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
