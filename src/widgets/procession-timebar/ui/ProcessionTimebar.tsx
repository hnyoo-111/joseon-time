import type { DayWindow, ProcessionTick } from '@/widgets/map-view';

interface Props {
  days: DayWindow[];
  tick: ProcessionTick | null;
  playing: boolean;
  tracking: boolean;
  historicalOn: boolean;
  onTogglePlay: () => void;
  onSeekDay: (dayIndex: number) => void;
  onToggleTracking: () => void;
  onToggleHistorical: () => void;
}

/**
 * 행차 전용 타임바. Cesium 기본 위젯 대신 아카이브 톤에 맞춰 직접 그린다.
 * 눈금은 초 단위가 아니라 **1일 단위**다 — 8일 일정이 한눈에 들어오는 게 이 화면의 목적이다.
 * 화면 오른쪽에 세로로 붙는다(하단 스텝 타임라인과 겹치지 않게).
 * 배속 조절은 두지 않는다 — 시계는 실제 보행 속도(1×)로만 흐르고, 빨리 보고 싶으면
 * 일차 버튼으로 그 날 출발 시각으로 건너뛴다.
 */
export function ProcessionTimebar({
  days, tick, playing, tracking, historicalOn,
  onTogglePlay, onSeekDay, onToggleTracking, onToggleHistorical,
}: Props) {
  const activeIndex = tick?.dayIndex ?? 0;

  return (
    <div className="ptb">
      <div className="ptb-head">
        <button className="ptb-play" onClick={onTogglePlay} title={playing ? '일시정지' : '재생'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <div className="ptb-clock">{tick?.clock ?? '--:--'}</div>
        {tick?.moving && <span className="ptb-moving">이동 중</span>}
      </div>

      <div className="ptb-now">
        <div className="ptb-now-day">{tick ? `${activeIndex + 1}일차 · ${tick.lunar}` : '행차 준비 중'}</div>
        <div className="ptb-now-label">{tick?.label ?? ''}</div>
      </div>

      <button className={`ptb-follow${tracking ? ' active' : ''}`} onClick={onToggleTracking}>
        {tracking ? '자유 시점' : '행렬 따라가기'}
      </button>

      {/* 1919년 조선지형도 오버레이 — 측량 지도라 경로와 정합된다(대동여지도는 안 맞아 뺐다). */}
      <button className={`ptb-follow ptb-historical${historicalOn ? ' active' : ''}`} onClick={onToggleHistorical}>
        {historicalOn ? '1919년 지형도 끄기' : '1919년 지형도 겹쳐 보기'}
      </button>

      <ol className="ptb-days">
        {days.map((d, i) => {
          const state = i < activeIndex ? 'past' : i === activeIndex ? 'now' : 'future';
          return (
            <li key={d.day} className={`ptb-day is-${state}${d.legId ? ' is-move' : ' is-stay'}`}>
              <button onClick={() => onSeekDay(i)} title={d.label}>
                <span className="ptb-day-n">{d.day}일차</span>
                <span className="ptb-day-lunar">{d.lunar}</span>
                <span className="ptb-day-meta">
                  {d.legId ? `${d.distanceKm.toFixed(1)}km · ${d.hours.toFixed(1)}시간` : '체류'}
                </span>
              </button>
              {i === activeIndex && (
                <span className="ptb-day-progress" style={{ width: `${(tick?.dayProgress ?? 0) * 100}%` }} />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
